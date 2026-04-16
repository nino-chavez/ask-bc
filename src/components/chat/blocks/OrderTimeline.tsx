'use client';

import type { OrderTimelineProps } from './types';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

export default function OrderTimeline({
  order_id,
  customer,
  total,
  current_status_label,
  events,
}: OrderTimelineProps) {
  return (
    <div className="tw-my-4 tw-rounded-lg tw-border tw-border-[#d9dce9] tw-bg-white tw-p-4 tw-max-w-lg">
      <div className="tw-flex tw-items-start tw-justify-between tw-mb-4">
        <div>
          <div className="tw-text-xs tw-uppercase tw-tracking-wide tw-text-[#737585] tw-font-medium">
            Order #{order_id}
          </div>
          <div className="tw-text-sm tw-text-[#313440] tw-mt-0.5">{customer}</div>
        </div>
        <div className="tw-text-right">
          <div className="tw-text-lg tw-font-semibold tw-text-[#313440] tw-tabular-nums">{total}</div>
          <div className="tw-text-xs tw-text-[#0c8a5a] tw-font-medium tw-mt-0.5">
            {current_status_label}
          </div>
        </div>
      </div>

      <div className="tw-relative tw-pl-4">
        <div className="tw-absolute tw-left-1.5 tw-top-1 tw-bottom-1 tw-w-0.5 tw-bg-[#e8e9ef]" />
        {events.map((ev, i) => (
          <div key={i} className="tw-relative tw-flex tw-items-start tw-gap-3 tw-pb-3 last:tw-pb-0">
            <div
              className="tw-absolute tw--left-4 tw-top-1 tw-w-3 tw-h-3 tw-rounded-full tw-border-2"
              style={{
                background: ev.done ? '#0c8a5a' : 'white',
                borderColor: ev.done ? '#0c8a5a' : '#d9dce9',
              }}
            />
            <div className="tw-flex-1 tw-pl-2">
              <div
                className="tw-text-sm tw-font-medium"
                style={{ color: ev.done ? '#313440' : '#8b8e9c' }}
              >
                {ev.label}
              </div>
              <div className="tw-text-xs tw-text-[#8b8e9c] tw-tabular-nums">{fmtDate(ev.date)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
