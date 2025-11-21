'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';

type User = {
  login: string;
  avatarUrl?: string;
};

type Repository = {
  id: string;
  nameWithOwner: string;
};

type ContributionRow = {
  repository: string;
  member: string;
  date: string;
  contributions: number;
  addedLines: number;
  removedLines: number;
};

type GraphMetric = 'contributions' | 'addedLines' | 'removedLines';

type SortColumn = 'repository' | 'member' | 'date' | 'contributions' | 'addedLines' | 'removedLines';
type SortDirection = 'asc' | 'desc';
type NumericSortColumn = Extract<SortColumn, 'contributions' | 'addedLines' | 'removedLines'>;

type ReportResponse = {
  totalRows: number;
  page: number;
  perPage: number;
  rows: ContributionRow[];
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
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphData, setGraphData] = useState<
    { member: string; contributions: number; addedLines: number; removedLines: number }[] | null
  >(null);
  const [showGraph, setShowGraph] = useState(false);
  const [graphMetric, setGraphMetric] = useState<GraphMetric>('contributions');

  const metricLabels: Record<GraphMetric, string> = {
    contributions: 'Commits',
    addedLines: 'Added Lines',
    removedLines: 'Removed Lines'
  };
  const metricOptions: GraphMetric[] = ['contributions', 'addedLines', 'removedLines'];

  const sortRows = useCallback((rows: ContributionRow[]) => {
    const rowsCopy = [...rows];
    rowsCopy.sort((a, b) => {
      const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.column === 'repository' || sortConfig.column === 'member' || sortConfig.column === 'date') {
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

  const chartData = useMemo(() => {
    if (!graphData) return [];
    const copy = [...graphData];
    copy.sort((a, b) => b[graphMetric] - a[graphMetric]);
    return copy.slice(0, 25);
  }, [graphData, graphMetric]);

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
    const headers = ['Repository', 'Member', 'Date', 'Contributions', 'Added Lines', 'Removed Lines'];
    const csvData = rows.map(row => [
      row.repository,
      row.member,
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

  // Export only currently displayed rows (current page)
  function exportCurrentPageCsv() {
    if (!sortedRows.length) return;
    downloadCsvFromRows(sortedRows);
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
                  onClick={exportCurrentPageCsv}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Export page CSV
                </button>
                <button
                  onClick={exportAllPagesCsv}
                  disabled={exporting}
                  className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
                >
                  {exporting ? 'Exporting...' : 'Export all CSV'}
                </button>
                <button
                  onClick={async () => {
                    if (showGraph) {
                      setShowGraph(false);
                      return;
                    }
                    // Generate graph data
                    setGraphLoading(true);
                    setShowGraph(true);
                    try {
                      // reuse pagination to fetch all pages
                      const perPage = reportData.perPage;
                      const total = reportData.totalRows;
                      const pages = Math.max(1, Math.ceil(total / perPage));
                      const memberMap = new Map<
                        string,
                        { contributions: number; addedLines: number; removedLines: number }
                      >();

                      const accumulateRow = (r: ContributionRow) => {
                        const existing = memberMap.get(r.member) ?? {
                          contributions: 0,
                          addedLines: 0,
                          removedLines: 0
                        };
                        existing.contributions += r.contributions;
                        existing.addedLines += r.addedLines;
                        existing.removedLines += r.removedLines;
                        memberMap.set(r.member, existing);
                      };

                      // include current page rows
                      if (reportData.rows && reportData.rows.length > 0) {
                        for (const r of reportData.rows) {
                          accumulateRow(r);
                        }
                      }

                      for (let p = 1; p <= pages; p++) {
                        if (p === reportData.page) continue;
                        const resp = await fetch('/api/github/report', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ repoFullNames: Array.from(selectedRepos), startDate, endDate, page: p, perPage })
                        });
                        if (!resp.ok) {
                          const text = await resp.text();
                          throw new Error(text || `Failed to fetch page ${p}`);
                        }
                        const json: ReportResponse = await resp.json();
                        for (const r of json.rows) {
                          accumulateRow(r);
                        }
                      }

                      const arr = Array.from(memberMap.entries()).map(([member, metrics]) => ({
                        member,
                        contributions: metrics.contributions,
                        addedLines: metrics.addedLines,
                        removedLines: metrics.removedLines
                      }));
                      setGraphData(arr);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to build graph');
                      setShowGraph(false);
                    } finally {
                      setGraphLoading(false);
                    }
                  }}
                  disabled={graphLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {showGraph ? (graphLoading ? 'Loading...' : 'Hide graph') : (graphLoading ? 'Loading...' : 'Graph report')}
                </button>
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
            <div className="bg-white shadow rounded overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <SortHeaderButton column="repository" label="Repository" />
                    </th>
                    <th className="px-6 py-3 text-left">
                      <SortHeaderButton column="member" label="Member" />
                    </th>
                    <th className="px-6 py-3 text-left">
                      <SortHeaderButton column="date" label="Date" />
                    </th>
                    <th className="px-6 py-3 text-right">
                      <SortHeaderButton column="contributions" label="Contributions" align="right" />
                    </th>
                    <th className="px-6 py-3 text-right">
                      <SortHeaderButton column="addedLines" label="Added Lines" align="right" />
                    </th>
                    <th className="px-6 py-3 text-right">
                      <SortHeaderButton column="removedLines" label="Removed Lines" align="right" />
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedRows.map((row, i) => (
                    <tr key={`${row.repository}-${row.member}-${row.date}-${i}`} className={i % 2 === 0 ? 'even:bg-gray-50 hover:bg-gray-100' : 'hover:bg-gray-100'}>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{row.repository}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">{row.member}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{row.date}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.contributions}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.addedLines}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.removedLines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {reportData.totalRows > reportData.perPage && (
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
            </div>
            {graphLoading && <div className="text-sm text-gray-600">Loading graph...</div>}
            {!graphLoading && chartData.length === 0 && (
              <div className="text-sm text-gray-600">No data to display.</div>
            )}
            {!graphLoading && chartData.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <BarChart
                  data={chartData}
                  width={945}
                  barHeight={25}
                  metric={graphMetric}
                  metricLabel={metricLabels[graphMetric]}
                />
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
  data: { member: string; contributions: number; addedLines: number; removedLines: number }[];
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

  return (
    <svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth+10} ${height +20}`} role="img" aria-label={`Top members by ${metricLabel}`}>
      {data.map((d, i) => {
        const y = 12 + i * (barHeight + gap);
        const value = d[metric] ?? 0;
        const w = Math.round((value / max) * chartInnerWidth);
        return (
          <g key={d.member}>
            <text x={8} y={y + barHeight / 2 + 4} fontSize={12} fill="#111">{d.member}</text>
            <rect x={paddingLeft} y={y} width={chartInnerWidth} height={barHeight} fill="#f1f5f9" rx={4} />
            <rect x={paddingLeft} y={y} width={w} height={barHeight} fill="#4f46e5" rx={4} />
            <text x={paddingLeft + chartInnerWidth + 8} y={y + barHeight / 2 + 4} fontSize={12} fill="#111">{value}</text>
          </g>
        );
      })}
    </svg>
  );
}
