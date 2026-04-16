'use client';

import type { DataTableProps } from './types';

export default function DataTable({ caption, columns, rows }: DataTableProps) {
  return (
    <div className="tw-my-4 tw-rounded-lg tw-border tw-border-[#d9dce9] tw-bg-white tw-overflow-hidden">
      {caption && (
        <div className="tw-px-4 tw-py-2.5 tw-border-b tw-border-[#e8e9ef] tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-[#737585] tw-bg-[#fafbfc]">
          {caption}
        </div>
      )}
      <div className="tw-overflow-x-auto">
        <table className="tw-w-full tw-border-collapse tw-text-sm">
          <thead>
            <tr className="tw-bg-[#fafbfc] tw-border-b tw-border-[#e8e9ef]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="tw-px-4 tw-py-2.5 tw-text-xs tw-font-medium tw-text-[#737585] tw-uppercase tw-tracking-wide"
                  style={{ textAlign: col.align ?? 'left' }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="tw-border-b tw-border-[#f0f1f5] last:tw-border-b-0 hover:tw-bg-[#fafbfc]"
              >
                {columns.map((col) => {
                  const v = row[col.key];
                  return (
                    <td
                      key={col.key}
                      className="tw-px-4 tw-py-2.5 tw-text-[#313440] tw-tabular-nums"
                      style={{ textAlign: col.align ?? 'left' }}
                    >
                      {v === null || v === undefined ? (
                        <span className="tw-text-[#8b8e9c]">—</span>
                      ) : typeof v === 'boolean' ? (
                        v ? '✓' : '✗'
                      ) : (
                        String(v)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
