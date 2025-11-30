'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';

const CHART_COLORS = [
  '#4f46e5', '#16a34a', '#f97316', '#0ea5e9', '#ec4899',
  '#22c55e', '#f59e0b', '#6366f1', '#2dd4bf', '#a855f7',
  '#ef4444', '#14b8a6', '#8b5cf6', '#84cc16', '#d946ef'
];

type User = {
  login: string;
  avatarUrl?: string;
};

type Repository = {
  id: string;
  nameWithOwner: string;
};

type ContributionRow = {
  id: string;
  repository: string;
  member: string;
  memberDisplay?: string | null;
  memberLogin?: string | null;
  memberCompany?: string | null;
  date: string;
  contributions: number;
  addedLines: number;
  removedLines: number;
  memberKey?: string;
};

type PullRequestDetailRow = {
  id: string;
  task: string;
  branchName: string;
  fileChanges: number;
  filesAdded: number;
  filesDeleted: number;
  filesModified: number;
  commitName: string;
  approvedBy: string | null;
  date: string;
  pullRequestUrl: string;
};

const detailNumberFormatter = new Intl.NumberFormat();
const detailDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const formatDetailDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return detailDateFormatter.format(parsed);
};

type GraphMetric =
  | 'tasks'
  | 'contributions'
  | 'addedLines'
  | 'removedLines'
  | 'filesAdded'
  | 'filesDeleted'
  | 'filesModified';
type GraphType = 'bar' | 'line' | 'pie';

type SortColumn = 'repository' | 'member' | 'date' | 'contributions' | 'addedLines' | 'removedLines';
type SortDirection = 'asc' | 'desc';
type NumericSortColumn = Extract<SortColumn, 'contributions' | 'addedLines' | 'removedLines'>;

type LineSeriesPoint = {
  date: string;
  contributions: number;
  addedLines: number;
  removedLines: number;
  tasks: number;
  filesAdded: number;
  filesDeleted: number;
  filesModified: number;
};

type MemberLineSeries = {
  member: string;
  memberDisplay?: string | null;
  points: LineSeriesPoint[];
};

type GraphAggregateRow = {
  member: string;
  memberDisplay?: string | null;
  contributions: number;
  addedLines: number;
  removedLines: number;
  tasks: number;
  filesAdded: number;
  filesDeleted: number;
  filesModified: number;
};

type ReportResponse = {
  totalRows: number;
  page: number;
  perPage: number;
  rows: ContributionRow[];
};

const makeRowKey = (row: ContributionRow) => {
  const key = row.memberKey ?? buildMemberKey(row.member, row.memberDisplay);
  return `${row.repository}|${key}|${row.date}`;
};
const getContributionRowId = (row: ContributionRow) => row.id ?? makeRowKey(row);
const formatMemberLabel = (member: string, memberDisplay?: string | null) =>
  memberDisplay && memberDisplay.trim().length > 0 ? memberDisplay.trim() : member;
const looksLikeGithubUsername = (value: string) => /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(value);
const normalizeIdentifier = (value?: string | null) =>
  value ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
const aliasCanonicalMap = new Map<string, string>();
let aliasIdCounter = 0;
const resetMemberAliasCache = () => {
  aliasCanonicalMap.clear();
  aliasIdCounter = 0;
};
const buildMemberKey = (member?: string | null, memberDisplay?: string | null) => {
  const normalizedMember = member?.trim() ?? "";
  const normalizedDisplay = memberDisplay?.trim() ?? "";
  if (normalizedMember && looksLikeGithubUsername(normalizedMember)) {
    return normalizedMember.toLowerCase();
  }
  if (normalizedDisplay && looksLikeGithubUsername(normalizedDisplay)) {
    return normalizedDisplay.toLowerCase();
  }
  if (normalizedMember) {
    return normalizedMember.toLowerCase();
  }
  if (normalizedDisplay) {
    return normalizedDisplay.toLowerCase();
  }
  return "unknown";
};
const normalizeContributionRow = (row: ContributionRow): ContributionRow => {
  const rawMember = row.member?.trim() ?? "";
  const rawDisplay = row.memberDisplay?.trim() ?? "";
  const rawLogin = row.memberLogin?.trim() ?? "";
  let memberValue = rawMember;
  let displayValue: string | null = rawDisplay || null;
  const loginCandidate = looksLikeGithubUsername(rawLogin) ? rawLogin : "";

  if (loginCandidate) {
    memberValue = loginCandidate;
  }
  if (rawMember && rawDisplay) {
    if (!looksLikeGithubUsername(rawMember) && looksLikeGithubUsername(rawDisplay)) {
      memberValue = rawDisplay;
      displayValue = rawMember;
    }
  } else if (!rawMember && rawDisplay) {
    if (looksLikeGithubUsername(rawDisplay)) {
      memberValue = rawDisplay;
      displayValue = null;
    } else {
      memberValue = rawDisplay;
      displayValue = rawDisplay;
    }
  }

  if (!memberValue && displayValue) {
    memberValue = displayValue;
  }
  if (!displayValue) {
    displayValue = memberValue;
  }

  const normalizedMember = normalizeIdentifier(memberValue);
  const normalizedDisplay = normalizeIdentifier(displayValue);
  const aliasCandidates = Array.from(
    new Set([normalizedMember, normalizedDisplay].filter(Boolean)),
  );

  let canonical =
    aliasCandidates
      .map((alias) => aliasCanonicalMap.get(alias))
      .find((value): value is string => Boolean(value)) ?? "";

  if (!canonical) {
    canonical = aliasCandidates[0] || `member-${++aliasIdCounter}`;
  }

  aliasCandidates.forEach((alias) => {
    if (alias) {
      aliasCanonicalMap.set(alias, canonical);
    }
  });

  const normalizedCompany = row.memberCompany?.trim() ?? null;
  const resolvedId = row.id ?? `${row.repository}|${canonical}|${row.date}`;

  return {
    ...row,
    id: resolvedId,
    member: memberValue,
    memberDisplay: displayValue,
    memberLogin: loginCandidate || null,
    memberCompany: normalizedCompany,
    memberKey: canonical,
  };
};
const normalizeContributionRows = (rows?: ContributionRow[]) =>
  (rows ?? [])
    .map(normalizeContributionRow)
    .filter((row) => Boolean(row.memberLogin));

const resolveMemberIdentifier = (row: ContributionRow) => {
  const login = row.memberLogin?.trim();
  if (login && login.length > 0) {
    return login;
  }
  const memberValue = row.member?.trim();
  if (memberValue && memberValue.length > 0) {
    return memberValue;
  }
  const displayValue = row.memberDisplay?.trim();
  if (displayValue && displayValue.length > 0) {
    return displayValue;
  }
  return "unknown";
};

export default function CenixGitHubReport() {
  // Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Repository selection state
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [pullAllRepos, setPullAllRepos] = useState(false);
  const [repoListVisible, setRepoListVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Report state
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: 'date',
    direction: 'desc'
  });
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Default to last 30 days
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [rowDetails, setRowDetails] = useState<Record<string, PullRequestDetailRow[]>>({});
  const [rowDetailsLoading, setRowDetailsLoading] = useState<Record<string, boolean>>({});
  const [rowDetailsErrors, setRowDetailsErrors] = useState<Record<string, string | null>>({});
  const [memberFilter, setMemberFilter] = useState<string>('all');

  // Load user data on mount
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          // Auto-load repos when user is authenticated
          loadRepositories();
        } else if (res.status === 401) {
          setUser(null);
        }
      } catch {
          setError('Failed to check authentication status');
        } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  // Load repositories
  async function loadRepositories() {
    try {
      setLoading(true);
      const res = await fetch('/api/github/repos');
      if (!res.ok) throw new Error('Failed to fetch repositories');
      const data = await res.json();
      setRepositories(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }

  // Filter repositories by search
  const filteredRepos = repositories.filter(repo => 
    searchQuery ? repo.nameWithOwner.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  // Handle repository selection
  function handleRepoToggle(repoName: string) {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(repoName)) {
      newSelected.delete(repoName);
    } else {
      newSelected.add(repoName);
    }
    setSelectedRepos(newSelected);
  }

  // Handle "Pull all repositories" toggle
  function handlePullAllToggle(checked: boolean) {
    setPullAllRepos(checked);
    if (checked) {
      setSelectedRepos(new Set(repositories.map(r => r.nameWithOwner)));
    } else {
      setSelectedRepos(new Set());
    }
  }

  // Load report data
  async function fetchReport(pageNum = page) {
    resetMemberAliasCache();
    try {
      setLoadingReport(true);
      setError(null);
      setExpandedRowKey(null);
      setRowDetails({});
      setRowDetailsErrors({});
      setRowDetailsLoading({});
      
      const res = await fetch('/api/github/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullNames: Array.from(selectedRepos),
          startDate,
          endDate,
          page: pageNum,
          perPage: 50
        })
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to fetch report');
      }

      const data = await res.json();
      const normalized = normalizeContributionRows(data.rows);
      setReportData({ ...data, rows: normalized });
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoadingReport(false);
    }
  }

  // Handle CSV export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ fetched: number; total?: number } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
const [graphData, setGraphData] = useState<GraphAggregateRow[] | null>(null);
  const [lineSeries, setLineSeries] = useState<MemberLineSeries[] | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [graphMetric, setGraphMetric] = useState<GraphMetric>('contributions');
  const [graphType, setGraphType] = useState<GraphType>('bar');
  const [showAxes, setShowAxes] = useState(true);
  const [visibleMembers, setVisibleMembers] = useState<Set<string>>(new Set());

  const [graphBuildProgress, setGraphBuildProgress] = useState<{ label: string; processed: number; total: number } | null>(null);
  const [exportingTasks, setExportingTasks] = useState(false);
  const [exportTasksProgress, setExportTasksProgress] = useState<{ processed: number; total: number } | null>(null);

const metricLabels: Record<GraphMetric, string> = {
  tasks: 'Tasks',
  contributions: 'Commits',
  addedLines: 'Modified Lines',
  removedLines: 'Optimized Lines',
  filesAdded: 'Files Added',
  filesDeleted: 'Files Deleted',
  filesModified: 'Files Modified'
};
const metricOptions: GraphMetric[] = [
  'tasks',
  'contributions',
  'addedLines',
  'removedLines',
  'filesAdded',
  'filesDeleted',
  'filesModified'
];
  const graphTypeOptions: { value: GraphType; label: string }[] = [
    { value: 'bar', label: 'Bar' },
    { value: 'line', label: 'Line' },
    { value: 'pie', label: 'Pie' }
  ];

  const sortRows = useCallback((rows: ContributionRow[]) => {
    const rowsCopy = [...rows];
    rowsCopy.sort((a, b) => {
      const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.column === 'member') {
        const aMember = formatMemberLabel(a.member, a.memberDisplay).toLowerCase();
        const bMember = formatMemberLabel(b.member, b.memberDisplay).toLowerCase();
        const cmp = aMember.localeCompare(bMember);
        if (cmp !== 0) {
          return cmp * multiplier;
        }
      } else if (sortConfig.column === 'repository' || sortConfig.column === 'date') {
        const cmp = a[sortConfig.column].localeCompare(b[sortConfig.column]);
        if (cmp !== 0) {
          return cmp * multiplier;
        }
      } else {
        const numericColumn = sortConfig.column as NumericSortColumn;
        const cmp = a[numericColumn] - b[numericColumn];
        if (cmp !== 0) {
          return cmp * multiplier;
        }
      }
      const dateFallback = b.date.localeCompare(a.date);
      if (dateFallback !== 0) return dateFallback;
      return b.contributions - a.contributions;
    });
    return rowsCopy;
  }, [sortConfig]);

  const sortedRows = useMemo(() => {
    if (!reportData?.rows) return [];
    return sortRows(reportData.rows);
  }, [reportData, sortRows]);

  const rowMatchesMemberFilter = useCallback(
    (row: ContributionRow) => {
      if (memberFilter === "all") {
        return true;
      }
      const identifier = resolveMemberIdentifier(row);
      return identifier === memberFilter;
    },
    [memberFilter],
  );

  const tableMemberOptions = useMemo(() => {
    if (!reportData?.rows) return [];
    const memberMap = new Map<string, string>();
    reportData.rows.forEach((row) => {
      const key =
        resolveMemberIdentifier(row) ||
        row.memberKey ||
        buildMemberKey(row.member, row.memberDisplay);
      if (!memberMap.has(key)) {
        const label = formatMemberLabel(row.member, row.memberDisplay) || "Unknown member";
        memberMap.set(key, label);
      }
    });
    return Array.from(memberMap.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [reportData]);

  const selectedMemberLabel = useMemo(() => {
    if (memberFilter === 'all') return null;
    const option = tableMemberOptions.find((opt) => opt.key === memberFilter);
    return option?.label ?? 'selected member';
  }, [memberFilter, tableMemberOptions]);

  const filteredTableRows = useMemo(() => {
    if (memberFilter === "all") return sortedRows;
    return sortedRows.filter((row) => rowMatchesMemberFilter(row));
  }, [sortedRows, memberFilter, rowMatchesMemberFilter]);

  useEffect(() => {
    if (memberFilter === 'all') return;
    const exists = tableMemberOptions.some((option) => option.key === memberFilter);
    if (!exists) {
      setMemberFilter('all');
    }
  }, [memberFilter, tableMemberOptions]);

  const chartData = useMemo(() => {
    if (!graphData) return [];
    const copy = [...graphData];
    copy.sort((a, b) => b[graphMetric] - a[graphMetric]);
    return copy.slice(0, 25);
  }, [graphData, graphMetric]);

  const allMembers = useMemo(() => {
    const unique = new Set<string>();
    graphData?.forEach(row => unique.add(row.member));
    lineSeries?.forEach(series => unique.add(series.member));
    return Array.from(unique);
  }, [graphData, lineSeries]);

  const memberLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    graphData?.forEach(row => map.set(row.member, formatMemberLabel(row.member, row.memberDisplay)));
    lineSeries?.forEach(series => map.set(series.member, formatMemberLabel(series.member, series.memberDisplay)));
    return map;
  }, [graphData, lineSeries]);

  useEffect(() => {
    if (!allMembers.length) return;
    setVisibleMembers((prev) => {
      if (!prev || prev.size === 0) {
        return new Set(allMembers);
      }
      const updated = new Set<string>();
      allMembers.forEach(member => {
        if (prev.has(member)) {
          updated.add(member);
        }
      });
      if (updated.size === 0) {
        return new Set(allMembers);
      }
      return updated;
    });
  }, [allMembers]);

  const activeMembers = useMemo(() => {
    if (!allMembers.length) return new Set<string>();
    if (!visibleMembers || visibleMembers.size === 0) {
      return new Set(allMembers);
    }
    return visibleMembers;
  }, [allMembers, visibleMembers]);

  const filteredChartData = useMemo(() => {
    if (!chartData.length) return [];
    const filtered = chartData.filter(row => activeMembers.has(row.member));
    if (filtered.length === 0) {
      return chartData;
    }
    return filtered;
  }, [chartData, activeMembers]);

  const baseLineSeries = useMemo(() => {
    if (!lineSeries) return [];
    return lineSeries.map(series => ({
      member: series.member,
      memberDisplay: series.memberDisplay,
      points: [...series.points].sort((a, b) => a.date.localeCompare(b.date))
    }));
  }, [lineSeries]);

  const filteredLineSeries = useMemo(() => {
    if (!baseLineSeries.length) return [];
    const filtered = baseLineSeries.filter(series => activeMembers.has(series.member));
    return filtered.length > 0 ? filtered : baseLineSeries;
  }, [baseLineSeries, activeMembers]);

  const shouldShowPagination =
    memberFilter === 'all' &&
    reportData !== null &&
    reportData.totalRows > reportData.perPage;

  function handleSort(column: SortColumn) {
    setSortConfig((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        column,
        direction: column === 'date' ? 'desc' : 'asc'
      };
    });
  }

  const SortHeaderButton = ({ column, label, align = 'left' }: { column: SortColumn; label: string; align?: 'left' | 'right' }) => {
    const isActive = sortConfig.column === column;
    return (
      <button
        type="button"
        onClick={() => handleSort(column)}
        className={`flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {isActive && (
          <span aria-hidden="true">
            {sortConfig.direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    );
  };

  function handleToggleMember(member: string) {
    setVisibleMembers((prev) => {
      const current = prev ? new Set(prev) : new Set<string>();
      const isSelected = current.has(member);
      if (isSelected) {
        if (current.size === 1) {
          return current;
        }
        current.delete(member);
        return current;
      }
      current.add(member);
      return current;
    });
  }

  function handleSelectAllMembers() {
    if (!allMembers.length) return;
    setVisibleMembers(new Set(allMembers));
  }

  function handleClearMembers() {
    if (!allMembers.length) return;
    const firstMember = allMembers[0];
    setVisibleMembers(new Set([firstMember]));
  }

  function downloadCsvFromRows(rows: ContributionRow[], filename?: string) {
    if (!rows || rows.length === 0) return;
    const headers = ['Repository', 'Row ID', 'Member', 'Company', 'Date', 'Contributions', 'Modified Lines', 'Optimized Lines'];
    const csvData = rows.map(row => [
      row.repository,
      getContributionRowId(row),
      formatMemberLabel(row.member, row.memberDisplay),
      row.memberCompany ?? '',
      row.date,
      String(row.contributions),
      String(row.addedLines),
      String(row.removedLines)
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `github-contributions-${startDate}-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async function fetchAllContributionRows(): Promise<ContributionRow[]> {
    if (!reportData) return [];
    const perPage = reportData.perPage;
    const total = reportData.totalRows;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const allRows: ContributionRow[] = [];

    if (reportData.rows && reportData.rows.length > 0) {
      const initial = memberFilter === 'all'
        ? reportData.rows
        : reportData.rows.filter(rowMatchesMemberFilter);
      allRows.push(...initial);
    }

    for (let p = 1; p <= pages; p++) {
      if (p === reportData.page) continue;

      const resp = await fetch('/api/github/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullNames: Array.from(selectedRepos),
          startDate,
          endDate,
          page: p,
          perPage
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Failed to fetch page ${p}`);
      }

      const json: ReportResponse = await resp.json();
      if (json.rows && json.rows.length > 0) {
        const normalized = normalizeContributionRows(json.rows);
        const matching = memberFilter === 'all'
          ? normalized
          : normalized.filter(rowMatchesMemberFilter);
        if (matching.length > 0) {
          allRows.push(...matching);
        }
      }
    }

    return allRows;
  }

  async function exportTasksCsv() {
    if (!reportData) return;
    setExportingTasks(true);
    setExportTasksProgress({ processed: 0, total: reportData.totalRows });

    try {
      const allRows = await fetchAllContributionRows();
      if (!allRows.length) {
        setError('No contributions available to export tasks.');
        return;
      }

      const uniqueRows = Array.from(new Map(allRows.map((row) => [getContributionRowId(row), row])).values());
      setExportTasksProgress({ processed: 0, total: uniqueRows.length });

      const taskRecords: Array<{
        repository: string;
        member: string;
        date: string;
        task: string;
        branchName: string;
        fileChanges: number;
        commitName: string;
        approvedBy: string | null;
        taskDate: string;
        pullRequestUrl: string;
      }> = [];

      let processed = 0;
      for (const contributionRow of uniqueRows) {
        let detailRows = rowDetails[getContributionRowId(contributionRow)];
        const memberLabel = formatMemberLabel(contributionRow.member, contributionRow.memberDisplay);

        if (!detailRows) {
          try {
            const response = await fetch('/api/github/row-details', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repository: contributionRow.repository,
                member: resolveMemberIdentifier(contributionRow),
                date: contributionRow.date
              })
            });

            if (!response.ok) {
              throw new Error(await response.text());
            }

            const data = (await response.json()) as { rows: PullRequestDetailRow[] };
            detailRows = data.rows ?? [];
          } catch (detailError) {
            console.error('Failed to load task details for export:', detailError);
            detailRows = [];
          }
        }

        if (detailRows.length > 0) {
          detailRows.forEach((detail) => {
            taskRecords.push({
              repository: contributionRow.repository,
              member: memberLabel,
              date: contributionRow.date,
              task: detail.task,
              branchName: detail.branchName,
              fileChanges: detail.fileChanges,
              commitName: detail.commitName,
              approvedBy: detail.approvedBy ?? '',
              taskDate: detail.date,
              pullRequestUrl: detail.pullRequestUrl
            });
          });
        }

        processed += 1;
        setExportTasksProgress({ processed, total: uniqueRows.length });
      }

      if (taskRecords.length === 0) {
        setError('No tasks found for the selected repositories.');
        return;
      }

      const headers = [
        'Repository',
        'Member',
        'Date',
        'Task',
        'Branch Name',
        'File Changes',
        'Commit Name',
        'Approved By',
        'Task Date',
        'Pull Request URL'
      ];

      const csvRows = taskRecords.map((record) => [
        record.repository,
        record.member,
        record.date,
        record.task,
        record.branchName,
        String(record.fileChanges),
        record.commitName,
        record.approvedBy ?? '',
        record.taskDate,
        record.pullRequestUrl
      ]);

      const csvContent = [
        headers.join(','),
        ...csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `github-tasks-${startDate}-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export tasks');
    } finally {
      setExportingTasks(false);
      setExportTasksProgress(null);
    }
  }

  const handleGraphReportClick = useCallback(async () => {
    if (!reportData) {
      setError('Generate a report before building the graph.');
      return;
    }

    if (selectedRepos.size === 0) {
      setError('Select at least one repository to build the graph.');
      return;
    }

    if (showGraph) {
      setShowGraph(false);
      return;
    }

    setGraphLoading(true);
    setShowGraph(true);
    setGraphBuildProgress(null);

    const memberMap = new Map<
      string,
      {
        memberDisplay?: string | null;
        contributions: number;
        addedLines: number;
        removedLines: number;
        tasks: number;
        filesAdded: number;
        filesDeleted: number;
        filesModified: number;
      }
    >();
    const timelineMap = new Map<
      string,
      Map<
        string,
        {
          contributions: number;
          addedLines: number;
          removedLines: number;
          tasks: number;
          filesAdded: number;
          filesDeleted: number;
          filesModified: number;
        }
      >
    >();
    const uniqueRowMap = new Map<string, ContributionRow>();
    const detailCache = new Map<string, PullRequestDetailRow[]>();

    const updateGraphState = () => {
      const arr = Array.from(memberMap.entries()).map(([memberKey, metrics]) => ({
        member: memberKey,
        memberDisplay: metrics.memberDisplay ?? memberKey,
        contributions: metrics.contributions,
        addedLines: metrics.addedLines,
        removedLines: metrics.removedLines,
        tasks: metrics.tasks,
        filesAdded: metrics.filesAdded,
        filesDeleted: metrics.filesDeleted,
        filesModified: metrics.filesModified
      }));
      setGraphData(arr);

      const lines = Array.from(timelineMap.entries()).map(([memberKey, datesMap]) => ({
        member: memberKey,
        memberDisplay: memberMap.get(memberKey)?.memberDisplay ?? memberKey,
        points: Array.from(datesMap.entries())
          .map(([date, stats]) => ({
            date,
            contributions: stats.contributions,
            addedLines: stats.addedLines,
            removedLines: stats.removedLines,
            tasks: stats.tasks,
            filesAdded: stats.filesAdded,
            filesDeleted: stats.filesDeleted,
            filesModified: stats.filesModified
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      }));
      setLineSeries(lines);
    };

    const accumulateRow = (r: ContributionRow) => {
      uniqueRowMap.set(getContributionRowId(r), r);
      const memberKey = r.memberKey ?? buildMemberKey(r.member, r.memberDisplay);
      const displayLabel = formatMemberLabel(r.member, r.memberDisplay);
      const existing = memberMap.get(memberKey) ?? {
        memberDisplay: displayLabel,
        contributions: 0,
        addedLines: 0,
        removedLines: 0,
        tasks: 0,
        filesAdded: 0,
        filesDeleted: 0,
        filesModified: 0
      };
      if (!existing.memberDisplay && displayLabel) {
        existing.memberDisplay = displayLabel;
      }
      existing.contributions += r.contributions;
      existing.addedLines += r.addedLines;
      existing.removedLines += r.removedLines;
      memberMap.set(memberKey, existing);

      const timeline = timelineMap.get(memberKey) ?? new Map();
      const dayStats = timeline.get(r.date) ?? {
        contributions: 0,
        addedLines: 0,
        removedLines: 0,
        tasks: 0,
        filesAdded: 0,
        filesDeleted: 0,
        filesModified: 0
      };
      dayStats.contributions += r.contributions;
      dayStats.addedLines += r.addedLines;
      dayStats.removedLines += r.removedLines;
      timeline.set(r.date, dayStats);
      timelineMap.set(memberKey, timeline);
    };

    const fetchDetailRowsForGraph = async (row: ContributionRow): Promise<PullRequestDetailRow[]> => {
      const cacheKey = getContributionRowId(row);
      if (detailCache.has(cacheKey)) {
        return detailCache.get(cacheKey)!;
      }
      if (rowDetails[cacheKey]) {
        const cachedRows = rowDetails[cacheKey] ?? [];
        detailCache.set(cacheKey, cachedRows);
        return cachedRows;
      }

      try {
        const response = await fetch('/api/github/row-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repository: row.repository,
            member: resolveMemberIdentifier(row),
            date: row.date
          })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = (await response.json()) as { rows: PullRequestDetailRow[] };
        const rows = data.rows ?? [];
        detailCache.set(cacheKey, rows);
        return rows;
      } catch (error) {
        console.error('Failed to load pull request details for graph:', error);
        detailCache.set(cacheKey, []);
        return [];
      }
    };

    const includeRows = (rows?: ContributionRow[]) => {
      if (!rows || rows.length === 0) return;
      const normalized = normalizeContributionRows(rows);
      normalized.forEach((row) => {
        if (!rowMatchesMemberFilter(row)) {
          return;
        }
        accumulateRow(row);
      });
      updateGraphState();
    };

    try {
      const perPage = reportData.perPage;
      const total = reportData.totalRows;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      let processedContributionPages = 0;

      includeRows(reportData.rows ?? []);
      if (reportData.rows && reportData.rows.length > 0) {
        processedContributionPages = 1;
      }
      setGraphBuildProgress({
        label: 'Aggregating contributions',
        processed: Math.min(processedContributionPages, totalPages),
        total: totalPages
      });

      for (let p = 1; p <= totalPages; p++) {
        if (p === reportData.page) continue;
        const resp = await fetch('/api/github/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullNames: Array.from(selectedRepos),
            startDate,
            endDate,
            page: p,
            perPage
          })
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `Failed to fetch page ${p}`);
        }

        const json: ReportResponse = await resp.json();
        includeRows(json.rows);
        processedContributionPages += 1;
        setGraphBuildProgress({
          label: 'Aggregating contributions',
          processed: Math.min(processedContributionPages, totalPages),
          total: totalPages
        });
      }

      setGraphBuildProgress({
        label: 'Aggregating contributions',
        processed: totalPages,
        total: totalPages
      });

      const uniqueRows = Array.from(uniqueRowMap.values());
      if (uniqueRows.length > 0) {
        let processedTasks = 0;
        setGraphBuildProgress({
          label: 'Counting tasks',
          processed: processedTasks,
          total: uniqueRows.length
        });

        for (const contributionRow of uniqueRows) {
          try {
            const detailRows = await fetchDetailRowsForGraph(contributionRow);
            if (detailRows.length === 0) {
              continue;
            }
            const uniqueDetails = Array.from(new Map(detailRows.map((detail) => [detail.id, detail])).values());
            const taskCount = uniqueDetails.length;
            const fileTotals = uniqueDetails.reduce(
              (acc, detail) => {
                acc.filesAdded += detail.filesAdded ?? 0;
                acc.filesDeleted += detail.filesDeleted ?? 0;
                acc.filesModified += detail.filesModified ?? 0;
                return acc;
              },
              { filesAdded: 0, filesDeleted: 0, filesModified: 0 }
            );

            if (taskCount > 0 || fileTotals.filesAdded > 0 || fileTotals.filesDeleted > 0 || fileTotals.filesModified > 0) {
              const memberKey =
                contributionRow.memberKey ?? buildMemberKey(contributionRow.member, contributionRow.memberDisplay);
              const metrics = memberMap.get(memberKey);
              if (metrics) {
                metrics.tasks += taskCount;
                metrics.filesAdded += fileTotals.filesAdded;
                metrics.filesDeleted += fileTotals.filesDeleted;
                metrics.filesModified += fileTotals.filesModified;
                memberMap.set(memberKey, metrics);
              }

              const timeline = timelineMap.get(memberKey) ?? new Map();
              const dateKey = contributionRow.date;
              const stats = timeline.get(dateKey) ?? {
                contributions: 0,
                addedLines: 0,
                removedLines: 0,
                tasks: 0,
                filesAdded: 0,
                filesDeleted: 0,
                filesModified: 0
              };
              stats.tasks += taskCount;
              stats.filesAdded += fileTotals.filesAdded;
              stats.filesDeleted += fileTotals.filesDeleted;
              stats.filesModified += fileTotals.filesModified;
              timeline.set(dateKey, stats);
              timelineMap.set(memberKey, timeline);
            }
          } catch (taskError) {
            console.error('Failed to build task count for', contributionRow.repository, taskError);
          } finally {
            processedTasks += 1;
            setGraphBuildProgress({
              label: 'Counting tasks',
              processed: processedTasks,
              total: uniqueRows.length
            });
            updateGraphState();
          }
        }
      }

      setGraphBuildProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build graph');
      setShowGraph(false);
    } finally {
      setGraphLoading(false);
      setGraphBuildProgress(null);
    }
  }, [reportData, selectedRepos, showGraph, startDate, endDate, rowMatchesMemberFilter, rowDetails]);

  // Export all pages by fetching all pages from server and concatenating rows
  async function exportAllPagesCsv() {
    if (!reportData) return;
    setExporting(true);
    setExportProgress({ fetched: 0, total: reportData.totalRows });
    try {
      const perPage = reportData.perPage;
      const total = reportData.totalRows;
      const pages = Math.max(1, Math.ceil(total / perPage));
      const allRows: ContributionRow[] = [];

      // start with current page rows if available
      if (reportData.rows && reportData.rows.length > 0) {
        const initial = memberFilter === 'all'
          ? reportData.rows
          : reportData.rows.filter(rowMatchesMemberFilter);
        allRows.push(...initial);
        setExportProgress({ fetched: allRows.length, total });
      }

      for (let p = 1; p <= pages; p++) {
        // skip page 1 if we already have it
        if (p === reportData.page) continue;

        const resp = await fetch('/api/github/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullNames: Array.from(selectedRepos),
            startDate,
            endDate,
            page: p,
            perPage
          })
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `Failed to fetch page ${p}`);
        }

        const json: ReportResponse = await resp.json();
        if (json.rows && json.rows.length > 0) {
          const normalized = normalizeContributionRows(json.rows);
          const matching = memberFilter === 'all'
            ? normalized
            : normalized.filter(rowMatchesMemberFilter);
          if (matching.length > 0) {
            allRows.push(...matching);
          }
        }
        setExportProgress({ fetched: allRows.length, total });
      }

      const rowsToExport = memberFilter === 'all' ? allRows : allRows.filter(rowMatchesMemberFilter);
      downloadCsvFromRows(sortRows(rowsToExport), `github-contributions-all-${startDate}-${endDate}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export all pages');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }

  const fetchRowDetailsForContribution = useCallback(async (row: ContributionRow) => {
    const key = getContributionRowId(row);
    if (rowDetails[key] || rowDetailsLoading[key]) {
      return;
    }

    setRowDetailsLoading((prev) => ({ ...prev, [key]: true }));
    setRowDetailsErrors((prev) => ({ ...prev, [key]: null }));

    try {
      const response = await fetch('/api/github/row-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: row.repository,
          member: resolveMemberIdentifier(row),
          date: row.date
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to load pull request details');
      }

      const data = (await response.json()) as { rows: PullRequestDetailRow[] };
      setRowDetails((prev) => ({ ...prev, [key]: data.rows }));
    } catch (err) {
      setRowDetailsErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Failed to load pull request details'
      }));
    } finally {
      setRowDetailsLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [rowDetails, rowDetailsLoading]);

  const handleRowToggle = useCallback((row: ContributionRow) => {
    const key = getContributionRowId(row);
    setExpandedRowKey((prev) => (prev === key ? null : key));
    if (expandedRowKey !== key) {
      void fetchRowDetailsForContribution(row);
    }
  }, [expandedRowKey, fetchRowDetailsForContribution]);

  const handleContributionRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, row: ContributionRow) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowToggle(row);
    }
  };

  const handleDetailRowActivation = (detail: PullRequestDetailRow) => {
    window.open(detail.pullRequestUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDetailRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, detail: PullRequestDetailRow) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleDetailRowActivation(detail);
    }
  };

  // Login handler
  function handleLogin() {
    window.location.href = '/api/auth/github/login';
  }

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">GitHub Contribution Report</h1>
          <p className="mb-4">Please sign in to view repository contributions.</p>
          <button
            onClick={handleLogin}
            className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            {user.avatarUrl && (
              <Image
                src={user.avatarUrl}
                alt={user.login}
                width={40}
                height={40}
                className="rounded-full"
              />
            )}
            <h1 className="text-2xl font-bold">GitHub Contribution Report</h1>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded mb-6">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="space-y-6 mb-8">
          {/* Repository selection */}
          <div className="bg-gray-50 p-4 rounded">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pullAllRepos}
                    onChange={(e) => handlePullAllToggle(e.target.checked)}
                    className="mr-1"
                  />
                  <span className="text-sm">Pull all repositories</span>
                </label>
                <button
                  type="button"
                  onClick={() => setRepoListVisible(v => !v)}
                  className="text-sm px-2 py-1 border rounded bg-white hover:bg-gray-100"
                >
                  {repoListVisible ? 'Hide list' : 'Show list'}
                </button>
              </div>

              <div style={{ minWidth: 220 }}>
                <input
                  type="text"
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 border rounded"
                  disabled={pullAllRepos || !repoListVisible}
                />
              </div>
            </div>

            {repoListVisible && (
              <div className="max-h-60 overflow-y-auto border rounded bg-white p-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {filteredRepos.map((repo) => (
                    <label
                      key={repo.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded"
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRepos.has(repo.nameWithOwner)}
                        onChange={() => handleRepoToggle(repo.nameWithOwner)}
                        disabled={pullAllRepos}
                        className="flex-shrink-0"
                      />
                      <span className="truncate">{repo.nameWithOwner}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date range */}
          <div className="flex gap-4">
            <div>
              <label className="block text-sm mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-2 border rounded"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={() => fetchReport(1)}
              disabled={loadingReport || selectedRepos.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingReport ? 'Loading...' : 'Generate Report'}
            </button>
            
            {reportData && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={exportTasksCsv}
                  disabled={exportingTasks}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Export task
                </button>
                {exportTasksProgress && (
                  <div style={{ fontSize: 12, color: '#333' }}>
                    Tasks {exportTasksProgress.processed}/{exportTasksProgress.total}
                  </div>
                )}
                <button
                  onClick={exportAllPagesCsv}
                  disabled={exporting}
                  className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
                >
                  {exporting ? 'Exporting...' : 'Export all CSV'}
                </button>
                <button
                  onClick={() => void handleGraphReportClick()}
                  disabled={graphLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {showGraph ? (graphLoading ? 'Loading...' : 'Hide graph') : (graphLoading ? 'Loading...' : 'Graph report')}
                </button>
                {graphBuildProgress && (
                  <div style={{ fontSize: 12, color: '#333' }}>
                    {graphBuildProgress.label} {graphBuildProgress.processed}/{graphBuildProgress.total}
                  </div>
                )}
                {exportProgress && (
                  <div style={{ fontSize: 12, color: '#333' }}>
                    Exported {exportProgress.fetched}{exportProgress.total ? ` / ${exportProgress.total}` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Results table */}
        {reportData && (
          <div>
            <div className="bg-white shadow rounded">
              <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Contribution details</p>
                <p className="text-xs text-gray-500">Filter by member to focus results.</p>
                </div>
                <label className="w-full text-sm font-medium text-gray-700 sm:w-64">
                  Member filter
                  <select
                    value={memberFilter}
                    onChange={(event) => setMemberFilter(event.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Filter contributions table by member"
                  >
                    <option value="all">All members</option>
                    {tableMemberOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {memberFilter !== 'all' && (
                <div className="border-b border-gray-200 px-6 py-2 text-sm text-gray-500">
                  Showing {filteredTableRows.length} contribution{filteredTableRows.length === 1 ? '' : 's'} for {selectedMemberLabel}.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <SortHeaderButton column="repository" label="Repository" />
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 w-32">
                      Row ID
                    </th>
                    <th className="px-6 py-3 text-left">
                      <SortHeaderButton column="member" label="Member" />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Task</th>
                    <th className="px-6 py-3 text-right">
                      <SortHeaderButton column="contributions" label="Contributions" align="right" />
                    </th>
                    <th className="px-6 py-3 text-right">
                      <SortHeaderButton column="addedLines" label="Modified Lines" align="right" />
                    </th>
                    <th className="px-6 py-3 text-right">
                      <SortHeaderButton column="removedLines" label="Optimized Lines" align="right" />
                    </th>
                    <th className="px-6 py-3 text-left">
                      <SortHeaderButton column="date" label="Date" />
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTableRows.map((row, i) => {
                    const rowKey = getContributionRowId(row);
                    const isExpanded = expandedRowKey === rowKey;
                    const detailRows = rowDetails[rowKey] ?? [];
                    const detailLoading = rowDetailsLoading[rowKey];
                    const detailError = rowDetailsErrors[rowKey];
                    const memberName = formatMemberLabel(row.member, row.memberDisplay);
                    const companyName = row.memberCompany?.trim() ?? '—';

                    return (
                      <React.Fragment key={rowKey}>
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle details for ${row.repository} ${memberName}`}
                          onClick={() => handleRowToggle(row)}
                          onKeyDown={(event) => handleContributionRowKeyDown(event, row)}
                          className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`}
                        >
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{row.repository}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] font-mono text-gray-600">{rowKey}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">{memberName}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">{companyName}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">
                            {detailLoading
                              ? '…'
                              : detailRows.length > 0
                                ? detailRows.length
                                : rowDetails[rowKey]
                                  ? 0
                                  : '—'}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.contributions}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.addedLines}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.removedLines}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{row.date}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="bg-gray-50 px-6 py-4">
                              <div className="space-y-4">
                                {detailLoading && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-b-2 border-gray-500" />
                                    Loading pull request details…
                                  </div>
                                )}

                                {!detailLoading && detailError && (
                                  <div className="flex items-center justify-between rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                    <span>{detailError}</span>
                                    <button
                                      type="button"
                                      onClick={() => fetchRowDetailsForContribution(row)}
                                      className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}

                                {!detailLoading && !detailError && detailRows.length === 0 && (
                                  <div className="text-sm text-gray-600">No pull requests found for this contributor on this date.</div>
                                )}

                                {!detailLoading && !detailError && detailRows.length > 0 && (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 rounded border border-gray-200 bg-white text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Task</th>
                                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Branch name</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">File changes</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Files added</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Files deleted</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Files modified</th>
                                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Commit name</th>
                                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Approved by</th>
                                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Date</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {detailRows.map((detail) => (
                                          <tr
                                            key={detail.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => handleDetailRowActivation(detail)}
                                            onKeyDown={(event) => handleDetailRowKeyDown(event, detail)}
                                            className="cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                                          >
                                            <td className="px-4 py-2 font-mono text-gray-900">{detail.task}</td>
                                            <td className="px-4 py-2 text-gray-900">{detail.branchName}</td>
                                            <td className="px-4 py-2 text-right text-gray-900">{detailNumberFormatter.format(detail.fileChanges)}</td>
                                            <td className="px-4 py-2 text-right text-gray-900">{detailNumberFormatter.format(detail.filesAdded ?? 0)}</td>
                                            <td className="px-4 py-2 text-right text-gray-900">{detailNumberFormatter.format(detail.filesDeleted ?? 0)}</td>
                                            <td className="px-4 py-2 text-right text-gray-900">{detailNumberFormatter.format(detail.filesModified ?? 0)}</td>
                                            <td className="px-4 py-2 text-gray-800">{detail.commitName}</td>
                                            <td className="px-4 py-2 text-gray-700">{detail.approvedBy ?? '—'}</td>
                                            <td className="px-4 py-2 text-gray-600">{formatDetailDate(detail.date)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredTableRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-600">
                        No contributions found for this member.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* Pagination */}
            {shouldShowPagination && (
              <div className="flex justify-center gap-2 mt-4">
                <button
                  onClick={() => fetchReport(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1">
                  Page {page} of {Math.ceil(reportData.totalRows / reportData.perPage)}
                </span>
                <button
                  onClick={() => fetchReport(page + 1)}
                  disabled={page * reportData.perPage >= reportData.totalRows}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Graph area */}
        {showGraph && (
          <div className="mt-6 bg-white p-4 rounded shadow">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-medium">Top members by {metricLabels[graphMetric]}</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {metricOptions.map((option) => {
                    const isActive = graphMetric === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setGraphMetric(option)}
                        disabled={graphLoading}
                        className={`rounded border px-3 py-1 text-sm transition ${
                          isActive ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                        } disabled:opacity-50`}
                        aria-pressed={isActive}
                      >
                        {metricLabels[option]}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {graphTypeOptions.map(({ value, label }) => {
                    const isActive = graphType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setGraphType(value)}
                        disabled={graphLoading}
                        className={`rounded border px-3 py-1 text-sm transition ${
                          isActive ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                        } disabled:opacity-50`}
                        aria-pressed={isActive}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showAxes}
                      onChange={(e) => setShowAxes(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span>Show axes</span>
                  </label>
                </div>
              </div>
            </div>
            {allMembers.length > 0 && (
              <div className="mb-4 rounded border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">Member visibility</span>
                  <div className="flex items-center gap-3 text-xs">
                    <button type="button" onClick={handleSelectAllMembers} className="text-indigo-600 hover:underline">Select all</button>
                    <button type="button" onClick={handleClearMembers} className="text-indigo-600 hover:underline">Clear all</button>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto text-sm">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {allMembers.map((member) => {
                      const isActive = activeMembers.has(member);
                      const label = memberLabelMap.get(member) ?? member;
                      return (
                        <label key={member} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => handleToggleMember(member)}
                            className="h-4 w-4"
                          />
                          <span className="truncate text-gray-700">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {graphLoading && <div className="text-sm text-gray-600">Loading graph...</div>}
            {!graphLoading && chartData.length === 0 && (
              <div className="text-sm text-gray-600">No data to display.</div>
            )}
            {!graphLoading && chartData.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                {graphType === 'bar' && (
                  <BarChart
                    data={filteredChartData}
                    width={945}
                    barHeight={25}
                    metric={graphMetric}
                    metricLabel={metricLabels[graphMetric]}
                  />
                )}
                {graphType === 'line' && (
                  filteredLineSeries.length > 0 ? (
                    <LineChart
                      series={filteredLineSeries}
                      width={945}
                      height={340}
                      metric={graphMetric}
                      metricLabel={metricLabels[graphMetric]}
                      showAxes={showAxes}
                    />
                  ) : (
                    <div className="text-sm text-gray-600">Not enough timeline data to render the line chart.</div>
                  )
                )}
                {graphType === 'pie' && (
                  <PieChart
                    data={filteredChartData}
                    size={360}
                    metric={graphMetric}
                    metricLabel={metricLabels[graphMetric]}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BarChart({
  data,
  metric,
  metricLabel,
  width = 600,
  barHeight = 24
}: {
  data: {
    member: string;
    memberDisplay?: string | null;
    contributions: number;
    addedLines: number;
    removedLines: number;
    tasks: number;
    filesAdded: number;
    filesDeleted: number;
    filesModified: number;
  }[];
  metric: GraphMetric;
  metricLabel: string;
  width?: number;
  barHeight?: number;
}) {
  const paddingLeft = 220; // label column width
  const gap = 8;
  const chartWidth = width;
  const chartInnerWidth = Math.max(200, chartWidth - paddingLeft - 24);
  const height = data.length * (barHeight + gap) + 24 ;
  const values = data.map(d => d[metric] ?? 0);
  const max = Math.max(1, ...values);
  const medalLabels = ['🥇', '🥈', '🥉'];
  const medalAssignments = new Map<string, string>();
  [...data]
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
    .slice(0, 3)
    .forEach((entry, index) => {
      if (medalLabels[index]) {
        medalAssignments.set(entry.member, medalLabels[index]);
      }
    });

  return (
    <svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth+10} ${height +20}`} role="img" aria-label={`Top members by ${metricLabel}`}>
      {data.map((d, i) => {
        const y = 12 + i * (barHeight + gap);
        const value = d[metric] ?? 0;
        const w = Math.round((value / max) * chartInnerWidth);
        const label = formatMemberLabel(d.member, d.memberDisplay);
        const medalLabel = medalAssignments.get(d.member);
        const isTopThree = i < 3;
        const fontSize = isTopThree ? 14 : 12;
        const medalFontSize = isTopThree ? 25 : 16;
        return (
          <g key={d.member}>
            {medalLabel && (
              <text x={8} y={y + barHeight / 2 + 6} fontSize={medalFontSize} fill="#111">{medalLabel}</text>
            )}
            <text x="45" y={y + barHeight / 2 + 4} fontSize={fontSize} fill="#111" fontWeight={isTopThree ? 600 : 400}>{label}</text>
            <rect x={paddingLeft} y={y} width={chartInnerWidth} height={barHeight} fill="#f1f5f9" rx={4} />
            <rect x={paddingLeft} y={y} width={w} height={barHeight} fill="#4f46e5" rx={4} />
            <text x={paddingLeft + chartInnerWidth + 8} y={y + barHeight / 2 + 4} fontSize={fontSize} fill="#111" fontWeight={isTopThree ? 600 : 400}>{value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({
  series,
  metric,
  metricLabel,
  width = 900,
  height = 340,
  showAxes = true
}: {
  series: MemberLineSeries[];
  metric: GraphMetric;
  metricLabel: string;
  width?: number;
  height?: number;
  showAxes?: boolean;
}) {
  if (!series.length) return null;

  const paddingLeft = 80;
  const paddingRight = 40;
  const paddingTop = 24;
  const paddingBottom = 80;
  const usableWidth = Math.max(60, width - paddingLeft - paddingRight);
  const usableHeight = Math.max(60, height - paddingTop - paddingBottom);

  const dateSet = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  if (dates.length === 0) {
    return <div className="text-sm text-gray-600">No timeline data available.</div>;
  }

  const stepX = dates.length > 1 ? usableWidth / (dates.length - 1) : 0;

  const allValues: number[] = [];
  series.forEach((s) => {
    const map = new Map(s.points.map((p) => [p.date, p]));
    dates.forEach((date) => {
      allValues.push(map.get(date)?.[metric] ?? 0);
    });
  });
  const maxValue = Math.max(1, ...allValues);

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (maxValue / tickCount) * i);

  const colorMap = new Map<string, string>();
  series.forEach((s, idx) => {
    colorMap.set(s.member, CHART_COLORS[idx % CHART_COLORS.length]);
  });

  const formatDateLabel = (date: string) => {
    try {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    } catch {
      // ignore
    }
    return date;
  };

  return (
    <div className="flex flex-col gap-4">
      <svg width={width} height={height} role="img" aria-label={`Line chart of ${metricLabel} over time`}>
        {showAxes && (
          <>
            <line
              x1={paddingLeft}
              y1={paddingTop}
              x2={paddingLeft}
              y2={paddingTop + usableHeight}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <line
              x1={paddingLeft}
              y1={paddingTop + usableHeight}
              x2={paddingLeft + usableWidth}
              y2={paddingTop + usableHeight}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            {ticks.map((tickValue, idx) => {
              const ratio = maxValue === 0 ? 0 : tickValue / maxValue;
              const y = paddingTop + usableHeight - ratio * usableHeight;
              return (
                <g key={`tick-${idx}`}>
                  <line
                    x1={paddingLeft - 6}
                    y1={y}
                    x2={paddingLeft}
                    y2={y}
                    stroke="#94a3b8"
                    strokeWidth={1}
                  />
                  <text
                    x={paddingLeft - 10}
                    y={y + 4}
                    fontSize={10}
                    fill="#475569"
                    textAnchor="end"
                  >
                    {Math.round(tickValue)}
                  </text>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={paddingLeft + usableWidth}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth={idx === 0 ? 0 : 1}
                  />
                </g>
              );
            })}
            <text
              x={paddingLeft - 50}
              y={paddingTop + usableHeight / 2}
              fontSize={11}
              fill="#475569"
              textAnchor="middle"
              transform={`rotate(-90, ${paddingLeft - 50}, ${paddingTop + usableHeight / 2})`}
            >
              {metricLabel}
            </text>
          </>
        )}
        {dates.map((date, idx) => {
          const x = paddingLeft + idx * stepX;
          return (
            <g key={date}>
              {showAxes && (
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={paddingTop + usableHeight}
                  stroke="#f1f5f9"
                  strokeWidth={1}
                />
              )}
              <text
                x={x}
                y={height - 40}
                fontSize={10}
                fill="#475569"
                textAnchor="middle"
                transform={`rotate(45, ${x}, ${height - 40})`}
              >
                {formatDateLabel(date)}
              </text>
            </g>
          );
        })}

        {series.map((s) => {
          const pointMap = new Map(s.points.map((p) => [p.date, p]));
          const color = colorMap.get(s.member) ?? '#4f46e5';
          const polylinePoints = dates
            .map((date, idx) => {
              const value = pointMap.get(date)?.[metric] ?? 0;
              const x = paddingLeft + idx * stepX;
              const y = paddingTop + usableHeight - (value / maxValue) * usableHeight;
              return `${x},${y}`;
            })
            .join(' ');

          return (
            <g key={s.member}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={2}
                points={polylinePoints}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {dates.map((date, idx) => {
                const value = pointMap.get(date)?.[metric] ?? 0;
                const x = paddingLeft + idx * stepX;
                const y = paddingTop + usableHeight - (value / maxValue) * usableHeight;
                return (
                  <g key={`${s.member}-${date}`}>
                    <circle cx={x} cy={y} r={3} fill={color} />
                    {value > 0 && (
                      <text x={x} y={y - 6} fontSize={10} fill={color} textAnchor="middle">
                        {value}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-sm text-gray-700">
        {series.map((s) => {
          const label = formatMemberLabel(s.member, s.memberDisplay);
          return (
            <div key={s.member} className="flex items-center gap-2">
              <span className="inline-block h-2 w-4 rounded" style={{ backgroundColor: colorMap.get(s.member) ?? '#4f46e5' }}></span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PieChart({
  data,
  metric,
  metricLabel,
  size = 360
}: {
  data: {
    member: string;
    memberDisplay?: string | null;
    contributions: number;
    addedLines: number;
    removedLines: number;
    tasks: number;
    filesAdded: number;
    filesDeleted: number;
    filesModified: number;
  }[];
  metric: GraphMetric;
  metricLabel: string;
  size?: number;
}) {
  const radius = size / 2;
  const center = radius;
  const values = data.map(d => d[metric] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const colors = CHART_COLORS;

  let cumulative = 0;

  const slices = data.map((d, i) => {
    const value = d[metric] ?? 0;
    const startAngle = cumulative;
    const angle = (value / total) * 360;
    cumulative += angle;
    const endAngle = cumulative;

    const largeArc = angle > 180 ? 1 : 0;

    const start = polarToCartesian(center, center, radius - 10, endAngle);
    const end = polarToCartesian(center, center, radius - 10, startAngle);

    const pathData = [
      `M ${center} ${center}`,
      `L ${start.x} ${start.y}`,
      `A ${radius - 10} ${radius - 10} 0 ${largeArc} 0 ${end.x} ${end.y}`,
      'Z'
    ].join(' ');

    return {
      pathData,
      color: colors[i % colors.length],
      member: d.member,
      memberDisplay: d.memberDisplay,
      value
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <svg width={size} height={size} role="img" aria-label={`Pie chart of ${metricLabel}`}>
        {slices.map((slice, index) => (
          <path key={slice.member + index} d={slice.pathData} fill={slice.color} stroke="#ffffff" strokeWidth={1} />
        ))}
        <text x={center} y={center} textAnchor="middle" fontSize={16} fill="#111">
          {metricLabel}
        </text>
      </svg>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slices.map((slice, index) => (
          <div key={slice.member + index} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: slice.color }}></span>
            <span className="truncate">{formatMemberLabel(slice.member, slice.memberDisplay)}</span>
            <span className="ml-auto font-medium">{slice.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}
