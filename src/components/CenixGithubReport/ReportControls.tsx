import React from 'react';
import { Repository, ReportResponse } from './utils';

type Progress = { processed: number; total: number };
type ExportProgress = { fetched: number; total?: number } | null;

interface ReportControlsProps {
  pullAllRepos: boolean;
  onPullAllToggle: (checked: boolean) => void;
  repoListVisible: boolean;
  onToggleRepoList: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  filteredRepos: Repository[];
  selectedRepos: Set<string>;
  onToggleRepo: (repoName: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  loadingReport: boolean;
  canGenerateReport: boolean;
  onGenerateReport: () => void;
  reportData: ReportResponse | null;
  onExportTasks: () => void;
  exportingTasks: boolean;
  exportTasksProgress: Progress | null;
  onExportAll: () => void;
  exporting: boolean;
  exportProgress: ExportProgress;
  onToggleGraph: () => void;
  graphLoading: boolean;
  showGraph: boolean;
  graphBuildProgress: Progress | null;
}

export const ReportControls: React.FC<ReportControlsProps> = ({
  pullAllRepos,
  onPullAllToggle,
  repoListVisible,
  onToggleRepoList,
  searchQuery,
  onSearchQueryChange,
  filteredRepos,
  selectedRepos,
  onToggleRepo,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  loadingReport,
  canGenerateReport,
  onGenerateReport,
  reportData,
  onExportTasks,
  exportingTasks,
  exportTasksProgress,
  onExportAll,
  exporting,
  exportProgress,
  onToggleGraph,
  graphLoading,
  showGraph,
  graphBuildProgress,
}) => {
  return (
    <div className="space-y-6 mb-8">
      <div className="bg-gray-50 p-4 rounded">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pullAllRepos}
                onChange={(event) => onPullAllToggle(event.target.checked)}
                className="mr-1"
              />
              <span className="text-sm">Pull all repositories</span>
            </label>
            <button
              type="button"
              onClick={onToggleRepoList}
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
              onChange={(event) => onSearchQueryChange(event.target.value)}
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
                    onChange={() => onToggleRepo(repo.nameWithOwner)}
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

      <div className="flex gap-4">
        <div>
          <label className="block text-sm mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="p-2 border rounded"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          onClick={onGenerateReport}
          disabled={loadingReport || !canGenerateReport}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingReport ? 'Loading...' : 'Generate Report'}
        </button>

        {reportData && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onExportTasks}
              disabled={exportingTasks}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Export task
            </button>
            {exportTasksProgress && (
              <span className="text-xs text-gray-700">
                Tasks {exportTasksProgress.processed}/{exportTasksProgress.total}
              </span>
            )}
            <button
              onClick={onExportAll}
              disabled={exporting}
              className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export all CSV'}
            </button>
            <button
              onClick={onToggleGraph}
              disabled={graphLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {showGraph ? (graphLoading ? 'Loading...' : 'Hide graph') : graphLoading ? 'Loading...' : 'Graph report'}
            </button>
            {graphBuildProgress && (
              <span className="text-xs text-gray-700">
                {graphBuildProgress.label} {graphBuildProgress.processed}/{graphBuildProgress.total}
              </span>
            )}
            {exportProgress && (
              <span className="text-xs text-gray-700">
                Exported {exportProgress.fetched}
                {typeof exportProgress.total === 'number' ? ` / ${exportProgress.total}` : ''}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

