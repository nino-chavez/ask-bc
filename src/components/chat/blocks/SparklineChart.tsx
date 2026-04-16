'use client';

import type { SparklineChartProps } from './types';

const WIDTH = 320;
const HEIGHT = 60;
const PADDING_X = 4;
const PADDING_Y = 6;

export default function SparklineChart({ label, points, total }: SparklineChartProps) {
  if (points.length < 2) {
    return null;
  }

  const values = points.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const innerW = WIDTH - PADDING_X * 2;
  const innerH = HEIGHT - PADDING_Y * 2;

  const coords = points.map((p, i) => {
    const x = PADDING_X + (i / (points.length - 1)) * innerW;
    const y = PADDING_Y + innerH - ((p.y - min) / range) * innerH;
    return { x, y, label: p.x, value: p.y };
  });

  const pathD = coords
    .map((c, i) => (i === 0 ? `M ${c.x},${c.y}` : `L ${c.x},${c.y}`))
    .join(' ');

  const areaD = `${pathD} L ${coords[coords.length - 1].x},${HEIGHT - PADDING_Y} L ${coords[0].x},${HEIGHT - PADDING_Y} Z`;

  return (
    <div className="tw-my-4 tw-rounded-lg tw-border tw-border-[#d9dce9] tw-bg-white tw-p-4 tw-max-w-md">
      <div className="tw-flex tw-items-baseline tw-justify-between tw-mb-2">
        <div className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-[#737585]">
          {label}
        </div>
        {total !== undefined && (
          <div className="tw-text-lg tw-font-semibold tw-text-[#313440] tw-tabular-nums">
            {total}
          </div>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="tw-block">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3C64F4" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3C64F4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#spark-fill)" />
        <path d={pathD} fill="none" stroke="#3C64F4" strokeWidth="1.75" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="2" fill="#3C64F4" />
        ))}
      </svg>
      <div className="tw-flex tw-justify-between tw-text-[10px] tw-text-[#8b8e9c] tw-mt-1 tw-tabular-nums">
        <span>{points[0].x}</span>
        <span>{points[points.length - 1].x}</span>
      </div>
    </div>
  );
}
