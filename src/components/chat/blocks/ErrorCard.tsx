'use client';

export interface ErrorCardProps {
  title: string;
  message: string;
  status_code?: number;
  endpoint?: string;
  suggestion?: string;
}

export default function ErrorCard({
  title,
  message,
  status_code,
  endpoint,
  suggestion,
}: ErrorCardProps) {
  return (
    <div className="tw-my-4 tw-rounded-lg tw-border tw-border-[#fbeaea] tw-bg-[#fdf4f4] tw-p-4 tw-max-w-lg">
      <div className="tw-flex tw-items-start tw-gap-3">
        <div className="tw-text-lg tw-mt-0.5">!</div>
        <div className="tw-flex-1 tw-min-w-0">
          <div className="tw-text-sm tw-font-semibold tw-text-[#8a3a3a]">{title}</div>
          <div className="tw-text-sm tw-text-[#6b3030] tw-mt-1">{message}</div>
          {(status_code || endpoint) && (
            <div className="tw-mt-2 tw-flex tw-gap-3 tw-text-xs tw-font-mono tw-text-[#8a3a3a80]">
              {status_code && <span>HTTP {status_code}</span>}
              {endpoint && <span>{endpoint}</span>}
            </div>
          )}
          {suggestion && (
            <div className="tw-mt-2 tw-text-xs tw-text-[#525566] tw-bg-white tw-rounded tw-px-3 tw-py-2 tw-border tw-border-[#f0e0e0]">
              {suggestion}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
