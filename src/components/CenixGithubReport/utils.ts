export const CHART_COLORS = [
  '#4f46e5',
  '#16a34a',
  '#f97316',
  '#0ea5e9',
  '#ec4899',
  '#22c55e',
  '#f59e0b',
  '#6366f1',
  '#2dd4bf',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#8b5cf6',
  '#84cc16',
  '#d946ef',
];

export type User = {
  login: string;
  avatarUrl?: string;
};

export type Repository = {
  id: string;
  nameWithOwner: string;
};

export type ContributionRow = {
  repository: string;
  member: string;
  memberDisplay?: string | null;
  date: string;
  contributions: number;
  addedLines: number;
  removedLines: number;
};

export type PullRequestDetailRow = {
  id: string;
  task: string;
  branchName: string;
  fileChanges: number;
  commitName: string;
  approvedBy: string | null;
  date: string;
  pullRequestUrl: string;
};

export type GraphMetric = 'contributions' | 'addedLines' | 'removedLines' | 'tasks';
export type GraphType = 'bar' | 'line' | 'pie';
export type GraphAggregateRow = {
  member: string;
  memberDisplay?: string | null;
  contributions: number;
  addedLines: number;
  removedLines: number;
  tasks: number;
};

export type SortColumn =
  | 'repository'
  | 'member'
  | 'date'
  | 'contributions'
  | 'addedLines'
  | 'removedLines';
export type SortDirection = 'asc' | 'desc';
export type NumericSortColumn = Extract<SortColumn, 'contributions' | 'addedLines' | 'removedLines'>;

export type LineSeriesPoint = {
  date: string;
  contributions: number;
  addedLines: number;
  removedLines: number;
  tasks: number;
};

export type MemberLineSeries = {
  member: string;
  memberDisplay?: string | null;
  points: LineSeriesPoint[];
};

export type ReportResponse = {
  totalRows: number;
  page: number;
  perPage: number;
  rows: ContributionRow[];
};

export const detailNumberFormatter = new Intl.NumberFormat();
const detailDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const formatDetailDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return detailDateFormatter.format(parsed);
};

export const metricLabels: Record<GraphMetric, string> = {
  contributions: 'Commits',
  addedLines: 'Modified Lines',
  removedLines: 'Optimized Lines',
  tasks: 'Tasks',
};

export const metricOptions: GraphMetric[] = ['tasks', 'contributions', 'addedLines', 'removedLines'];

export const graphTypeOptions: { value: GraphType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
];

export const makeRowKey = (row: ContributionRow) => `${row.repository}|${row.member}|${row.date}`;

export const formatMemberLabel = (member: string, memberDisplay?: string | null) =>
  memberDisplay && memberDisplay.trim().length > 0 ? memberDisplay.trim() : member;

