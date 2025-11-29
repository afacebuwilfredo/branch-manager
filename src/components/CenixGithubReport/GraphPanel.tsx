import React from 'react';
import {
  CHART_COLORS,
  GraphAggregateRow,
  graphTypeOptions,
  GraphMetric,
  GraphType,
  MemberLineSeries,
  metricLabels,
  metricOptions,
  formatMemberLabel,
} from './utils';

interface GraphPanelProps {
  showGraph: boolean;
  graphLoading: boolean;
  graphMetric: GraphMetric;
  graphType: GraphType;
  showAxes: boolean;
  allMembers: string[];
  activeMembers: Set<string>;
  memberLabelMap: Map<string, string>;
  chartData: GraphAggregateRow[];
  filteredChartData: GraphAggregateRow[];
  filteredLineSeries: MemberLineSeries[];
  onMetricChange: (metric: GraphMetric) => void;
  onGraphTypeChange: (type: GraphType) => void;
  onAxesToggle: (value: boolean) => void;
  onToggleMember: (member: string) => void;
  onSelectAllMembers: () => void;
  onClearMembers: () => void;
}

export const GraphPanel: React.FC<GraphPanelProps> = ({
  showGraph,
  graphLoading,
  graphMetric,
  graphType,
  showAxes,
  allMembers,
  activeMembers,
  memberLabelMap,
  chartData,
  filteredChartData,
  filteredLineSeries,
  onMetricChange,
  onGraphTypeChange,
  onAxesToggle,
  onToggleMember,
  onSelectAllMembers,
  onClearMembers,
}) => {
  if (!showGraph) {
    return null;
  }

  return (
    <div className="mt-6 rounded shadow bg-white p-4">
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
                  onClick={() => onMetricChange(option)}
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
                  onClick={() => onGraphTypeChange(value)}
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
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showAxes}
              onChange={(event) => onAxesToggle(event.target.checked)}
              className="h-4 w-4"
            />
            <span>Show axes</span>
          </label>
        </div>
      </div>

      {allMembers.length > 0 && (
        <div className="mb-4 rounded border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Member visibility</span>
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={onSelectAllMembers} className="text-indigo-600 hover:underline">
                Select all
              </button>
              <button type="button" onClick={onClearMembers} className="text-indigo-600 hover:underline">
                Clear all
              </button>
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
                      onChange={() => onToggleMember(member)}
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
          {graphType === 'line' &&
            (filteredLineSeries.length > 0 ? (
              <LineChart
                series={filteredLineSeries}
                width={945}
                height={340}
                metric={graphMetric}
                metricLabel={metricLabels[graphMetric]}
                showAxes={showAxes}
              />
            ) : (
              <div className="text-sm text-gray-600">
                Not enough timeline data to render the line chart.
              </div>
            ))}
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
  );
};

function BarChart({
  data,
  metric,
  metricLabel,
  width = 600,
  barHeight = 24,
}: {
  data: GraphAggregateRow[];
  metric: GraphMetric;
  metricLabel: string;
  width?: number;
  barHeight?: number;
}) {
  const paddingLeft = 220;
  const gap = 8;
  const chartWidth = width;
  const chartInnerWidth = Math.max(200, chartWidth - paddingLeft - 24);
  const height = data.length * (barHeight + gap) + 24;
  const values = data.map((d) => d[metric] ?? 0);
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
    <svg
      width={chartWidth}
      height={height}
      viewBox={`0 0 ${chartWidth + 10} ${height + 20}`}
      role="img"
      aria-label={`Top members by ${metricLabel}`}
    >
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
              <text x={8} y={y + barHeight / 2 + 6} fontSize={medalFontSize} fill="#111">
                {medalLabel}
              </text>
            )}
            <text
              x="45"
              y={y + barHeight / 2 + 4}
              fontSize={fontSize}
              fill="#111"
              fontWeight={isTopThree ? 600 : 400}
            >
              {label}
            </text>
            <rect x={paddingLeft} y={y} width={chartInnerWidth} height={barHeight} fill="#f1f5f9" rx={4} />
            <rect x={paddingLeft} y={y} width={w} height={barHeight} fill="#4f46e5" rx={4} />
            <text
              x={paddingLeft + chartInnerWidth + 8}
              y={y + barHeight / 2 + 4}
              fontSize={fontSize}
              fill="#111"
              fontWeight={isTopThree ? 600 : 400}
            >
              {value}
            </text>
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
  showAxes = true,
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
      // ignore parsing errors
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
                  <text x={paddingLeft - 10} y={y + 4} fontSize={10} fill="#475569" textAnchor="end">
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
              <span
                className="inline-block h-2 w-4 rounded"
                style={{ backgroundColor: colorMap.get(s.member) ?? '#4f46e5' }}
              />
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
  size = 360,
}: {
  data: GraphAggregateRow[];
  metric: GraphMetric;
  metricLabel: string;
  size?: number;
}) {
  const radius = size / 2;
  const center = radius;
  const values = data.map((d) => d[metric] ?? 0);
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
      'Z',
    ].join(' ');

    return {
      pathData,
      color: colors[i % colors.length],
      member: d.member,
      memberDisplay: d.memberDisplay,
      value,
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
        {slices.map((slice) => (
          <div key={slice.member} className="flex items-center gap-3 text-sm text-gray-700">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: slice.color }} />
            <span className="truncate">
              {formatMemberLabel(slice.member, slice.memberDisplay)} — {slice.value}
            </span>
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

