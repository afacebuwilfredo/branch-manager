'use client';

import React, { useState, useEffect } from 'react';
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
};

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
  const [searchQuery, setSearchQuery] = useState('');

  // Report state
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [page, setPage] = useState(1);
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
      } catch (err) {
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

  function downloadCsvFromRows(rows: ContributionRow[], filename?: string) {
    if (!rows || rows.length === 0) return;
    const headers = ['Repository', 'Member', 'Date', 'Contributions'];
    const csvData = rows.map(row => [
      row.repository,
      row.member,
      row.date,
      String(row.contributions)
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
    if (!reportData?.rows.length) return;
    downloadCsvFromRows(reportData.rows);
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

      downloadCsvFromRows(allRows, `github-contributions-all-${startDate}-${endDate}.csv`);
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
            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={pullAllRepos}
                  onChange={(e) => handlePullAllToggle(e.target.checked)}
                  className="mr-2"
                />
                Pull all repositories
              </label>
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-2 border rounded"
                disabled={pullAllRepos}
              />
            </div>

            <div className="max-h-60 overflow-y-auto border rounded bg-white">
              {filteredRepos.map((repo) => (
                <label key={repo.id} className="flex items-center p-2 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedRepos.has(repo.nameWithOwner)}
                    onChange={() => handleRepoToggle(repo.nameWithOwner)}
                    disabled={pullAllRepos}
                    className="mr-2"
                  />
                  {repo.nameWithOwner}
                </label>
              ))}
            </div>
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
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left">Repository</th>
                    <th className="px-4 py-2 text-left">Member</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-right">Contributions</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2">{row.repository}</td>
                      <td className="px-4 py-2">{row.member}</td>
                      <td className="px-4 py-2">{row.date}</td>
                      <td className="px-4 py-2 text-right">{row.contributions}</td>
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
      </div>
    </div>
  );
}
