'use client';

import { useState } from 'react';

export interface WriteApprovalProps {
  toolCallId: string;
  toolName: string;
  input: unknown;
  summary?: string;
  state: 'waiting-approval' | 'approved' | 'denied' | 'complete';
  onApprove: (toolCallId: string) => void;
  onDeny: (toolCallId: string) => void;
}

const TOOL_LABELS: Record<string, { title: string; verb: string; icon: string }> = {
  createCoupon: { title: 'Create coupon', verb: 'create this coupon', icon: '🎟' },
  updateProductInventory: {
    title: 'Update inventory',
    verb: 'change the inventory level',
    icon: '📦',
  },
  setProductVisibility: {
    title: 'Change product visibility',
    verb: 'change the storefront visibility',
    icon: '👁',
  },
  updateProductPrice: { title: 'Update price', verb: 'change the price', icon: '💰' },
};

function humanizeArgs(name: string, input: unknown): Array<{ key: string; value: string }> {
  if (!input || typeof input !== 'object') return [];
  const entries = Object.entries(input as Record<string, unknown>);
  return entries.map(([key, v]) => ({
    key,
    value:
      v === null
        ? '—'
        : typeof v === 'object'
          ? JSON.stringify(v)
          : typeof v === 'boolean'
            ? v
              ? 'yes'
              : 'no'
            : String(v),
  }));
}

export default function WriteApproval({
  toolCallId,
  toolName,
  input,
  summary,
  state,
  onApprove,
  onDeny,
}: WriteApprovalProps) {
  const [acting, setActing] = useState(false);
  const label = TOOL_LABELS[toolName] ?? {
    title: toolName,
    verb: 'perform this write',
    icon: '⚙',
  };
  const args = humanizeArgs(toolName, input);

  const isWaiting = state === 'waiting-approval';
  const isComplete = state === 'complete' || state === 'approved';
  const isDenied = state === 'denied';

  async function handle(fn: () => void) {
    if (acting) return;
    setActing(true);
    fn();
    // Keep the button disabled — the server will stream a new state
    // and this component will re-render with state !== waiting-approval.
  }

  return (
    <div
      className="tw-my-4 tw-rounded-lg tw-border tw-bg-white tw-max-w-lg"
      style={{
        borderColor: isDenied ? '#fbeaea' : isComplete ? '#d6efdf' : '#fde4c4',
        borderLeftWidth: 4,
        borderLeftColor: isDenied ? '#c42a2a' : isComplete ? '#0c8a5a' : '#d18400',
      }}
    >
      <div className="tw-px-4 tw-py-3 tw-border-b tw-border-[#f0f1f5]">
        <div className="tw-flex tw-items-center tw-justify-between">
          <div className="tw-flex tw-items-center tw-gap-2">
            <span style={{ fontSize: 18 }}>{label.icon}</span>
            <div>
              <div className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-[#737585]">
                {isWaiting
                  ? 'Pending approval'
                  : isComplete
                    ? 'Executed'
                    : isDenied
                      ? 'Cancelled'
                      : 'Write operation'}
              </div>
              <div className="tw-text-sm tw-font-semibold tw-text-[#313440]">{label.title}</div>
            </div>
          </div>
          <div className="tw-text-[10px] tw-font-mono tw-text-[#8b8e9c]">
            {toolCallId.slice(-8)}
          </div>
        </div>
        {summary && (
          <div className="tw-mt-2 tw-text-sm tw-text-[#525566]">{summary}</div>
        )}
      </div>

      <div className="tw-px-4 tw-py-3">
        <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-[#737585] tw-mb-2">
          Arguments
        </div>
        <dl className="tw-grid tw-grid-cols-[auto_1fr] tw-gap-x-4 tw-gap-y-1 tw-text-xs">
          {args.map(({ key, value }) => (
            <div key={key} className="tw-contents">
              <dt className="tw-font-mono tw-text-[#8b8e9c]">{key}</dt>
              <dd className="tw-font-mono tw-text-[#313440] tw-break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {isWaiting && (
        <div className="tw-flex tw-gap-2 tw-px-4 tw-py-3 tw-border-t tw-border-[#f0f1f5] tw-bg-[#fafbfc]">
          <button
            onClick={() => handle(() => onApprove(toolCallId))}
            disabled={acting}
            className="tw-flex-1 tw-rounded tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-white tw-transition-colors"
            style={{
              background: acting ? '#8b8e9c' : '#0c8a5a',
              cursor: acting ? 'wait' : 'pointer',
            }}
          >
            {acting ? 'Running…' : 'Execute'}
          </button>
          <button
            onClick={() => handle(() => onDeny(toolCallId))}
            disabled={acting}
            className="tw-rounded tw-px-3 tw-py-2 tw-text-sm tw-font-medium tw-border tw-border-[#d9dce9] tw-text-[#525566] tw-bg-white"
            style={{ cursor: acting ? 'wait' : 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {isComplete && (
        <div className="tw-px-4 tw-py-2 tw-border-t tw-border-[#f0f1f5] tw-bg-[#f0faf4] tw-text-xs tw-text-[#0c8a5a] tw-font-medium">
          ✓ Change applied to your store
        </div>
      )}

      {isDenied && (
        <div className="tw-px-4 tw-py-2 tw-border-t tw-border-[#f0f1f5] tw-bg-[#fdf4f4] tw-text-xs tw-text-[#c42a2a] tw-font-medium">
          ✕ Cancelled — no changes were made
        </div>
      )}
    </div>
  );
}
