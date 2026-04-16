'use client';

import type { KPICardProps } from './types';

const trendStyles = {
  up: { color: '#0c8a5a', bg: '#e6f6ef', arrow: '↑' },
  down: { color: '#c42a2a', bg: '#fbeaea', arrow: '↓' },
  flat: { color: '#737585', bg: '#eef0f5', arrow: '→' },
} as const;

export default function KPICard({ label, value, trend, hint }: KPICardProps) {
  return (
    <div
      className="tw-my-3 tw-inline-flex tw-flex-col tw-rounded-lg tw-border tw-border-[#d9dce9] tw-bg-white tw-px-5 tw-py-4 tw-mr-3"
      style={{ minWidth: 160 }}
    >
      <div className="tw-text-xs tw-uppercase tw-tracking-wide tw-text-[#737585] tw-font-medium">
        {label}
      </div>
      <div
        className="tw-text-2xl tw-font-semibold tw-text-[#313440] tw-mt-1 tw-tabular-nums"
        style={{ letterSpacing: '-0.01em' }}
      >
        {value}
      </div>
      {trend && (
        <div
          className="tw-mt-2 tw-inline-flex tw-items-center tw-gap-1 tw-rounded-full tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-self-start"
          style={{
            color: trendStyles[trend.direction].color,
            background: trendStyles[trend.direction].bg,
          }}
        >
          <span>{trendStyles[trend.direction].arrow}</span>
          <span>{trend.label}</span>
        </div>
      )}
      {hint && <div className="tw-text-xs tw-text-[#8b8e9c] tw-mt-2">{hint}</div>}
    </div>
  );
}
