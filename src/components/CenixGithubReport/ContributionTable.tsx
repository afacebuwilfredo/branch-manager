import React from 'react';
import {
  ContributionRow,
  PullRequestDetailRow,
  ReportResponse,
  detailNumberFormatter,
  formatDetailDate,
  formatMemberLabel,
  makeRowKey,
  SortColumn,
  SortDirection,
} from './utils';

type MemberOption = {
  member: string;
  label: string;
};

type ContributionTableProps = {
  reportData: ReportResponse | null;
  memberFilter: string;
  memberOptions: MemberOption[];
  onMemberFilterChange: (value: string) => void;
  filteredRows: ContributionRow[];
  sortConfig: { column: SortColumn; direction: SortDirection };
  onSortChange: (column: SortColumn) => void;
  expandedRowKey: string | null;
  onRowToggle: (row: ContributionRow) => void;
  onContributionKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>, row: ContributionRow) => void;
  rowDetails: Record<string, PullRequestDetailRow[]>;
  rowDetailsLoading: Record<string, boolean>;
  rowDetailsErrors: Record<string, string | null>;
  fetchRowDetails: (row: ContributionRow) => Promise<void>;
  onDetailRowActivate: (detail: PullRequestDetailRow) => void;
  onDetailRowKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>, detail: PullRequestDetailRow) => void;
  page: number;
  fetchReport: (pageNum: number) => Promise<void>;
};

export const ContributionTable: React.FC<ContributionTableProps> = ({
  reportData,
  memberFilter,
  memberOptions,
  onMemberFilterChange,
  filteredRows,
  sortConfig,
  onSortChange,
  expandedRowKey,
  onRowToggle,
  onContributionKeyDown,
  rowDetails,
  rowDetailsLoading,
  rowDetailsErrors,
  fetchRowDetails,
  onDetailRowActivate,
  onDetailRowKeyDown,
  page,
  fetchReport,
}) => {
  if (!reportData) {
    return null;
  }

  return (
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
              onChange={(event) => onMemberFilterChange(event.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter contributions table by member"
            >
              <option value="all">All members</option>
              {memberOptions.map((option) => (
                <option key={option.member} value={option.member}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <SortHeaderButton column="repository" label="Repository" sortConfig={sortConfig} onSortChange={onSortChange} />
                </th>
                <th className="px-6 py-3 text-left">
                  <SortHeaderButton column="member" label="Member" sortConfig={sortConfig} onSortChange={onSortChange} />
                </th>
                <th className="px-6 py-3 text-left">
                  <SortHeaderButton column="date" label="Date" sortConfig={sortConfig} onSortChange={onSortChange} />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Task
                </th>
                <th className="px-6 py-3 text-right">
                  <SortHeaderButton column="contributions" label="Contributions" align="right" sortConfig={sortConfig} onSortChange={onSortChange} />
                </th>
                <th className="px-6 py-3 text-right">
                  <SortHeaderButton column="addedLines" label="Modified Lines" align="right" sortConfig={sortConfig} onSortChange={onSortChange} />
                </th>
                <th className="px-6 py-3 text-right">
                  <SortHeaderButton column="removedLines" label="Optimized Lines" align="right" sortConfig={sortConfig} onSortChange={onSortChange} />
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRows.map((row, index) => {
                const rowKey = makeRowKey(row);
                const isExpanded = expandedRowKey === rowKey;
                const detailRows = rowDetails[rowKey] ?? [];
                const detailLoading = rowDetailsLoading[rowKey];
                const detailError = rowDetailsErrors[rowKey];
                const memberName = formatMemberLabel(row.member, row.memberDisplay);

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-label={`Toggle details for ${row.repository} ${memberName}`}
                      onClick={() => onRowToggle(row)}
                      onKeyDown={(event) => onContributionKeyDown(event, row)}
                      className={`cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`}
                    >
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{row.repository}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">{memberName}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{row.date}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">
                        {detailLoading ? '…' : detailRows.length > 0 ? detailRows.length : rowDetails[rowKey] ? 0 : '—'}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.contributions}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.addedLines}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">{row.removedLines}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50 px-6 py-4">
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
                                  onClick={() => fetchRowDetails(row)}
                                  className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                                >
                                  Retry
                                </button>
                              </div>
                            )}

                            {!detailLoading && !detailError && detailRows.length === 0 && (
                              <div className="text-sm text-gray-600">
                                No pull requests found for this contributor on this date.
                              </div>
                            )}

                            {!detailLoading && !detailError && detailRows.length > 0 && (
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 rounded border border-gray-200 bg-white text-sm">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Task
                                      </th>
                                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Branch name
                                      </th>
                                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        File changes
                                      </th>
                                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Commit name
                                      </th>
                                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Approved by
                                      </th>
                                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Date
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {detailRows.map((detail) => (
                                      <tr
                                        key={detail.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onDetailRowActivate(detail)}
                                        onKeyDown={(event) => onDetailRowKeyDown(event, detail)}
                                        className="cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                                      >
                                        <td className="px-4 py-2 font-mono text-gray-900">{detail.task}</td>
                                        <td className="px-4 py-2 text-gray-900">{detail.branchName}</td>
                                        <td className="px-4 py-2 text-right text-gray-900">
                                          {detailNumberFormatter.format(detail.fileChanges)}
                                        </td>
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
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-600">
                    No contributions found for this member.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reportData.totalRows > reportData.perPage && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => fetchReport(page - 1)}
            disabled={page === 1}
            className="rounded border px-3 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1">
            Page {page} of {Math.ceil(reportData.totalRows / reportData.perPage)}
          </span>
          <button
            onClick={() => fetchReport(page + 1)}
            disabled={page * reportData.perPage >= reportData.totalRows}
            className="rounded border px-3 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

function SortHeaderButton({
  column,
  label,
  align = 'left',
  sortConfig,
  onSortChange,
}: {
  column: SortColumn;
  label: string;
  align?: 'left' | 'right';
  sortConfig: { column: SortColumn; direction: SortDirection };
  onSortChange: (column: SortColumn) => void;
}) {
  const isActive = sortConfig.column === column;
  return (
    <button
      type="button"
      onClick={() => onSortChange(column)}
      className={`flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      {isActive && <span aria-hidden="true">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );
}

