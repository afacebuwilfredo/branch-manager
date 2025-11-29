import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatMemberLabel,
  GraphMetric,
  GraphType,
  MemberLineSeries,
  ReportResponse,
} from './utils';

type GraphBuildProgress = { label: string; processed: number; total: number } | null;

interface GraphBuilderParams {
  reportData: ReportResponse | null;
  selectedRepos: Set<string>;
  startDate: string;
  endDate: string;
  setError: (value: string | null) => void;
}

export const useGraphBuilder = ({
  reportData,
  selectedRepos,
  startDate,
  endDate,
  setError,
}: GraphBuilderParams) => {
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphData, setGraphData] = useState<
    {
      member: string;
      memberDisplay?: string | null;
      contributions: number;
      addedLines: number;
      removedLines: number;
      tasks: number;
    }[] | null
  >(null);
  const [lineSeries, setLineSeries] = useState<MemberLineSeries[] | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [graphMetric, setGraphMetric] = useState<GraphMetric>('contributions');
  const [graphType, setGraphType] = useState<GraphType>('bar');
  const [showAxes, setShowAxes] = useState(true);
  const [visibleMembers, setVisibleMembers] = useState<Set<string>>(new Set());
  const [graphBuildProgress, setGraphBuildProgress] = useState<GraphBuildProgress>(null);

  const chartData = useMemo(() => {
    if (!graphData) return [];
    const copy = [...graphData];
    copy.sort((a, b) => b[graphMetric] - a[graphMetric]);
    return copy.slice(0, 25);
  }, [graphData, graphMetric]);

  const allMembers = useMemo(() => {
    const unique = new Set<string>();
    graphData?.forEach((row) => unique.add(row.member));
    lineSeries?.forEach((series) => unique.add(series.member));
    return Array.from(unique);
  }, [graphData, lineSeries]);

  const memberLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    graphData?.forEach((row) => map.set(row.member, formatMemberLabel(row.member, row.memberDisplay)));
    lineSeries?.forEach((series) =>
      map.set(series.member, formatMemberLabel(series.member, series.memberDisplay)),
    );
    return map;
  }, [graphData, lineSeries]);

  useEffect(() => {
    if (!allMembers.length) return;
    setVisibleMembers((prev) => {
      if (!prev || prev.size === 0) {
        return new Set(allMembers);
      }
      const updated = new Set<string>();
      allMembers.forEach((member) => {
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
    const filtered = chartData.filter((row) => activeMembers.has(row.member));
    if (filtered.length === 0) {
      return chartData;
    }
    return filtered;
  }, [chartData, activeMembers]);

  const baseLineSeries = useMemo(() => {
    if (!lineSeries) return [];
    return lineSeries.map((series) => ({
      member: series.member,
      memberDisplay: series.memberDisplay,
      points: [...series.points].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, [lineSeries]);

  const filteredLineSeries = useMemo(() => {
    if (!baseLineSeries.length) return [];
    const filtered = baseLineSeries.filter((series) => activeMembers.has(series.member));
    return filtered.length > 0 ? filtered : baseLineSeries;
  }, [baseLineSeries, activeMembers]);

  const handleToggleMember = useCallback((member: string) => {
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
  }, []);

  const handleSelectAllMembers = useCallback(() => {
    if (!allMembers.length) return;
    setVisibleMembers(new Set(allMembers));
  }, [allMembers]);

  const handleClearMembers = useCallback(() => {
    if (!allMembers.length) return;
    const firstMember = allMembers[0];
    setVisibleMembers(new Set([firstMember]));
  }, [allMembers]);

  const buildGraphData = useCallback(
    async (includeTasks: boolean) => {
      if (!reportData) {
        setError('Generate a report before building the graph.');
        return;
      }

      if (selectedRepos.size === 0) {
        setError('Select at least one repository to build the graph.');
        return;
      }

      setGraphLoading(true);
      setShowGraph(true);
      setGraphBuildProgress({ label: 'Fetching contributions', processed: 0, total: 1 });

      const uniqueRowMap = new Map<string, (typeof graphData)[number]>();
      const memberMap = new Map<
        string,
        {
          memberDisplay?: string | null;
          contributions: number;
          addedLines: number;
          removedLines: number;
          tasks: number;
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
          }
        >
      >();

      const includeRows = (rows?: typeof graphData extends Array<infer R> ? R[] : never) => {
        if (!rows || rows.length === 0) return;
        rows.forEach((row) => {
          const key = `${row.repository}|${row.member}|${row.date}`;
          uniqueRowMap.set(key, row);

          const displayLabel = formatMemberLabel(row.member, row.memberDisplay);
          const existing = memberMap.get(row.member) ?? {
            memberDisplay: displayLabel,
            contributions: 0,
            addedLines: 0,
            removedLines: 0,
            tasks: 0,
          };
          if (!existing.memberDisplay && displayLabel) {
            existing.memberDisplay = displayLabel;
          }
          existing.contributions += row.contributions;
          existing.addedLines += row.addedLines;
          existing.removedLines += row.removedLines;
          memberMap.set(row.member, existing);

          const timeline = timelineMap.get(row.member) ?? new Map();
          const dayStats = timeline.get(row.date) ?? {
            contributions: 0,
            addedLines: 0,
            removedLines: 0,
            tasks: 0,
          };
          dayStats.contributions += row.contributions;
          dayStats.addedLines += row.addedLines;
          dayStats.removedLines += row.removedLines;
          timeline.set(row.date, dayStats);
          timelineMap.set(row.member, timeline);
        });
      };

      const updateGraphState = () => {
        const arr = Array.from(memberMap.entries()).map(([member, metrics]) => ({
          member,
          memberDisplay: metrics.memberDisplay ?? member,
          contributions: metrics.contributions,
          addedLines: metrics.addedLines,
          removedLines: metrics.removedLines,
          tasks: metrics.tasks,
        }));
        setGraphData(arr);

        const lines = Array.from(timelineMap.entries()).map(([member, datesMap]) => ({
          member,
          memberDisplay: memberMap.get(member)?.memberDisplay ?? member,
          points: Array.from(datesMap.entries())
            .map(([date, stats]) => ({
              date,
              contributions: stats.contributions,
              addedLines: stats.addedLines,
              removedLines: stats.removedLines,
              tasks: stats.tasks,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        }));
        setLineSeries(lines);
      };

      try {
        if (reportData.rows && reportData.rows.length > 0) {
          includeRows(reportData.rows);
        }

        const perPage = reportData.perPage;
        const total = reportData.totalRows;
        const pages = Math.max(1, Math.ceil(total / perPage));

        let processedContributionPages = 0;
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
              perPage,
            }),
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
            processed: Math.min(processedContributionPages, pages),
            total: pages,
          });
        }

        setGraphBuildProgress({
          label: 'Aggregating contributions',
          processed: pages,
          total: pages,
        });

        if (includeTasks) {
          const uniqueRows = Array.from(uniqueRowMap.values());
          if (uniqueRows.length > 0) {
            let processedTasks = 0;
            setGraphBuildProgress({
              label: 'Counting tasks',
              processed: processedTasks,
              total: uniqueRows.length,
            });

            for (const contributionRow of uniqueRows) {
              try {
                const countResponse = await fetch('/api/github/task-count', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    repository: contributionRow.repository,
                    member: contributionRow.member,
                    date: contributionRow.date,
                  }),
                });

                if (countResponse.ok) {
                  const countData = (await countResponse.json()) as { count?: number };
                  const taskCount = typeof countData.count === 'number' ? countData.count : 0;

                  if (taskCount > 0) {
                    const metrics = memberMap.get(contributionRow.member);
                    if (metrics) {
                      metrics.tasks += taskCount;
                      memberMap.set(contributionRow.member, metrics);
                    }

                    const timeline = timelineMap.get(contributionRow.member) ?? new Map();
                    const dateKey = contributionRow.date;
                    const stats = timeline.get(dateKey) ?? {
                      contributions: 0,
                      addedLines: 0,
                      removedLines: 0,
                      tasks: 0,
                    };
                    stats.tasks += taskCount;
                    timeline.set(dateKey, stats);
                    timelineMap.set(contributionRow.member, timeline);
                  }
                }
              } catch (taskError) {
                console.error('Failed to count tasks for', contributionRow.repository, taskError);
              } finally {
                processedTasks += 1;
                setGraphBuildProgress({
                  label: 'Counting tasks',
                  processed: processedTasks,
                  total: uniqueRows.length,
                });
                updateGraphState();
              }
            }
          }
        }

        updateGraphState();
        setGraphBuildProgress(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to build graph');
        setShowGraph(false);
      } finally {
        setGraphLoading(false);
        setGraphBuildProgress(null);
      }
    },
    [endDate, reportData, selectedRepos, setError, startDate],
  );

  const handleGraphReportClick = useCallback(() => {
    if (graphLoading) return;
    if (showGraph) {
      setShowGraph(false);
      return;
    }
    void buildGraphData(true);
  }, [buildGraphData, graphLoading, showGraph]);

  return {
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
  };
};

