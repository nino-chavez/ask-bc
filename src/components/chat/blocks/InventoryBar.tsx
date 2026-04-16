'use client';

import type { InventoryBarProps } from './types';

function inventoryState(
  value: number,
  low: number,
  ok: number,
): { color: string; label: string } {
  if (value <= low) return { color: '#c42a2a', label: 'LOW' };
  if (value < ok) return { color: '#d18400', label: 'WATCH' };
  return { color: '#0c8a5a', label: 'OK' };
}

export default function InventoryBar({ caption, items }: InventoryBarProps) {
  const max = Math.max(...items.map((i) => Math.max(i.value, i.threshold_ok * 1.5)), 1);

  return (
    <div className="tw-my-4 tw-rounded-lg tw-border tw-border-[#d9dce9] tw-bg-white tw-p-4">
      {caption && (
        <div className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-[#737585] tw-mb-3">
          {caption}
        </div>
      )}
      <div className="tw-flex tw-flex-col tw-gap-3">
        {items.map((item, i) => {
          const state = inventoryState(item.value, item.threshold_low, item.threshold_ok);
          const pct = Math.min(100, (item.value / max) * 100);
          return (
            <div key={i}>
              <div className="tw-flex tw-items-baseline tw-justify-between tw-mb-1">
                <div className="tw-text-sm tw-text-[#313440] tw-truncate tw-flex-1 tw-mr-2">
                  {item.label}
                </div>
                <div className="tw-flex tw-items-center tw-gap-2">
                  <span
                    className="tw-text-[10px] tw-font-semibold tw-px-1.5 tw-py-0.5 tw-rounded"
                    style={{ color: state.color, background: `${state.color}15` }}
                  >
                    {state.label}
                  </span>
                  <span className="tw-text-sm tw-font-semibold tw-text-[#313440] tw-tabular-nums tw-w-10 tw-text-right">
                    {item.value}
                  </span>
                </div>
              </div>
              <div className="tw-h-1.5 tw-bg-[#f0f1f5] tw-rounded-full tw-overflow-hidden">
                <div
                  className="tw-h-full tw-rounded-full tw-transition-all"
                  style={{ width: `${pct}%`, background: state.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
