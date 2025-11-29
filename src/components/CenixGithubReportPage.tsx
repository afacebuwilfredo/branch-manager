'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  detailNumberFormatter,
  formatDetailDate,
  formatMemberLabel,
  makeRowKey,
  type ContributionRow,
  type LineSeriesPoint,
  type MemberLineSeries,
  type NumericSortColumn,
  type PullRequestDetailRow,
  type Repository,
  type ReportResponse,
  type SortColumn,
  type SortDirection,
  type User,
} from './CenixGithubReport/utils';
import { GraphPanel } from './CenixGithubReport/GraphPanel';
import { ContributionTable } from './CenixGithubReport/ContributionTable';
import { ReportControls } from './CenixGithubReport/ReportControls';
import { useGraphBuilder } from './CenixGithubReport/useGraphBuilder';

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
      setReportData(data);
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
  const [exportingTasks, setExportingTasks] = useState(false);
  const [exportTasksProgress, setExportTasksProgress] = useState<{ processed: number; total: number } | null>(null);

  const {
    showGraph,
    graphLoading,
    graphMetric,
    setGraphMetric,
    graphType,
    setGraphType,
    showAxes,
    setShowAxes,
    graphBuildProgress,
    chartData,
    filteredChartData,
    filteredLineSeries,
    memberLabelMap,
    allMembers,
    activeMembers,
    handleToggleMember,
    handleSelectAllMembers,
    handleClearMembers,
    handleGraphReportClick,
  } = useGraphBuilder({ reportData, selectedRepos, startDate, endDate, setError });

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

  const tableMemberOptions = useMemo(() => {
    if (!reportData?.rows) return [];
    const memberMap = new Map<string, string>();
    reportData.rows.forEach((row) => {
      if (!memberMap.has(row.member)) {
        memberMap.set(row.member, formatMemberLabel(row.member, row.memberDisplay));
      }
    });
    return Array.from(memberMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([member, label]) => ({ member, label }));
  }, [reportData]);

  const filteredTableRows = useMemo(() => {
    if (memberFilter === 'all') return sortedRows;
    return sortedRows.filter((row) => row.member === memberFilter);
  }, [sortedRows, memberFilter]);

  useEffect(() => {
    if (memberFilter === 'all') return;
    const exists = tableMemberOptions.some((option) => option.member === memberFilter);
    if (!exists) {
      setMemberFilter('all');
    }
  }, [memberFilter, tableMemberOptions]);

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

  function downloadCsvFromRows(rows: ContributionRow[], filename?: string) {
    if (!rows || rows.length === 0) return;
    const headers = ['Repository', 'Member', 'Date', 'Contributions', 'Modified Lines', 'Optimized Lines'];
    const csvData = rows.map(row => [
      row.repository,
      formatMemberLabel(row.member, row.memberDisplay),
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
      allRows.push(...reportData.rows);
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
        allRows.push(...json.rows);
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

      const uniqueRows = Array.from(new Map(allRows.map((row) => [makeRowKey(row), row])).values());
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
        let detailRows = rowDetails[makeRowKey(contributionRow)];
        const memberLabel = formatMemberLabel(contributionRow.member, contributionRow.memberDisplay);

        if (!detailRows) {
          try {
            const response = await fetch('/api/github/row-details', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repository: contributionRow.repository,
                member: contributionRow.member,
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
        allRows.push(...reportData.rows);
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
          allRows.push(...json.rows);
        }
        setExportProgress({ fetched: allRows.length, total });
      }

      downloadCsvFromRows(sortRows(allRows), `github-contributions-all-${startDate}-${endDate}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export all pages');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }

  const fetchRowDetailsForContribution = useCallback(async (row: ContributionRow) => {
    const key = makeRowKey(row);
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
          member: row.member,
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
    const key = makeRowKey(row);
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
      <div className="max-w-6xl mx-auto">
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

        <ReportControls
          pullAllRepos={pullAllRepos}
          onPullAllToggle={handlePullAllToggle}
          repoListVisible={repoListVisible}
          onToggleRepoList={() => setRepoListVisible((value) => !value)}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          filteredRepos={filteredRepos}
          selectedRepos={selectedRepos}
          onToggleRepo={handleRepoToggle}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          loadingReport={loadingReport}
          canGenerateReport={selectedRepos.size > 0}
          onGenerateReport={() => fetchReport(1)}
          reportData={reportData}
          onExportTasks={exportTasksCsv}
          exportingTasks={exportingTasks}
          exportTasksProgress={exportTasksProgress}
          onExportAll={exportAllPagesCsv}
          exporting={exporting}
          exportProgress={exportProgress}
          onToggleGraph={() => void handleGraphReportClick()}
          graphLoading={graphLoading}
          showGraph={showGraph}
          graphBuildProgress={graphBuildProgress}
        />

        <ContributionTable
          reportData={reportData}
          memberFilter={memberFilter}
          memberOptions={tableMemberOptions}
          onMemberFilterChange={setMemberFilter}
          filteredRows={filteredTableRows}
          sortConfig={sortConfig}
          onSortChange={handleSort}
          expandedRowKey={expandedRowKey}
          onRowToggle={handleRowToggle}
          onContributionKeyDown={handleContributionRowKeyDown}
          rowDetails={rowDetails}
          rowDetailsLoading={rowDetailsLoading}
          rowDetailsErrors={rowDetailsErrors}
          fetchRowDetails={fetchRowDetailsForContribution}
          onDetailRowActivate={handleDetailRowActivation}
          onDetailRowKeyDown={handleDetailRowKeyDown}
          page={page}
          fetchReport={fetchReport}
        />

        <GraphPanel
          showGraph={showGraph}
          graphLoading={graphLoading}
          graphMetric={graphMetric}
          graphType={graphType}
          showAxes={showAxes}
          allMembers={allMembers}
          activeMembers={activeMembers}
          memberLabelMap={memberLabelMap}
          chartData={chartData}
          filteredChartData={filteredChartData}
          filteredLineSeries={filteredLineSeries}
          onMetricChange={setGraphMetric}
          onGraphTypeChange={setGraphType}
          onAxesToggle={setShowAxes}
          onToggleMember={handleToggleMember}
          onSelectAllMembers={handleSelectAllMembers}
          onClearMembers={handleClearMembers}
        />
      </div>
    </div>
  );
}
