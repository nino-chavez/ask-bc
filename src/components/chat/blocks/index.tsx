'use client';

import type { ReactNode } from 'react';
import ChatMarkdown from '../ChatMarkdown';
import KPICard from './KPICard';
import DataTable from './DataTable';
import ProductCard from './ProductCard';
import OrderTimeline from './OrderTimeline';
import InventoryBar from './InventoryBar';
import SparklineChart from './SparklineChart';
import ErrorCard from './ErrorCard';
import type { Block, BlockType } from './types';

export { default as KPICard } from './KPICard';
export { default as DataTable } from './DataTable';
export { default as ProductCard } from './ProductCard';
export { default as OrderTimeline } from './OrderTimeline';
export { default as InventoryBar } from './InventoryBar';
export { default as SparklineChart } from './SparklineChart';
export type * from './types';

/**
 * Runtime registry — maps block type strings to React component.
 * The renderer uses this to dispatch parsed blocks to their components.
 */
const REGISTRY: Record<BlockType, (props: never) => ReactNode> = {
  KPICard: KPICard as (props: never) => ReactNode,
  DataTable: DataTable as (props: never) => ReactNode,
  ProductCard: ProductCard as (props: never) => ReactNode,
  OrderTimeline: OrderTimeline as (props: never) => ReactNode,
  InventoryBar: InventoryBar as (props: never) => ReactNode,
  SparklineChart: SparklineChart as (props: never) => ReactNode,
  ErrorCard: ErrorCard as (props: never) => ReactNode,
};

interface ParsedSegment {
  kind: 'markdown' | 'block' | 'error';
  text?: string;
  block?: Block;
  error?: { raw: string; message: string };
}

/**
 * Scan a markdown string for fenced code blocks with language `block` and
 * split the text into alternating markdown / block segments. Each block
 * segment is a parsed JSON object that the renderer dispatches to a
 * React component.
 *
 * Fences that fail to JSON-parse or specify an unknown type become
 * `error` segments — they render inline as a subtle warning so the model
 * output is still readable.
 */
export function parseSegments(content: string, streaming = false): ParsedSegment[] {
  const segments: ParsedSegment[] = [];

  // During streaming, suppress incomplete fences that haven't closed yet.
  // This prevents the raw JSON from flashing as text mid-stream. [P-2]
  let safeContent = content;
  if (streaming) {
    const lastOpen = content.lastIndexOf('```block');
    if (lastOpen !== -1) {
      const afterOpen = content.slice(lastOpen);
      const closeIdx = afterOpen.indexOf('\n```', afterOpen.indexOf('\n') + 1);
      if (closeIdx === -1) {
        safeContent = content.slice(0, lastOpen);
      }
    }
  }

  const fenceRegex = /```block\s*\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(safeContent)) !== null) {
    // Markdown text before the fence
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim().length > 0) {
        segments.push({ kind: 'markdown', text });
      }
    }

    const raw = match[1];
    try {
      const parsed = JSON.parse(raw) as Block;
      if (parsed && parsed.type && parsed.type in REGISTRY) {
        segments.push({ kind: 'block', block: parsed });
      } else {
        segments.push({
          kind: 'error',
          error: { raw, message: `Unknown block type: ${parsed?.type ?? '(missing)'}` },
        });
      }
    } catch (err) {
      segments.push({
        kind: 'error',
        error: {
          raw,
          message: err instanceof Error ? err.message : 'JSON parse failed',
        },
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Tail markdown after the last fence
  if (lastIndex < safeContent.length) {
    const text = safeContent.slice(lastIndex);
    if (text.trim().length > 0) {
      segments.push({ kind: 'markdown', text });
    }
  }

  // If the content had no fences at all, return a single markdown segment
  if (segments.length === 0 && safeContent.trim().length > 0) {
    segments.push({ kind: 'markdown', text: safeContent });
  }

  return segments;
}

interface BlockRendererProps {
  content: string;
  streaming?: boolean;
}

/**
 * Renders an agent response that may contain interleaved markdown and
 * ```block``` fenced JSON components. Markdown segments pass through the
 * existing ChatMarkdown renderer; block segments mount real React
 * components from the registry. During streaming, incomplete fences are
 * suppressed to prevent raw JSON flashing. [P-2]
 */
export function BlockRenderer({ content, streaming = false }: BlockRendererProps) {
  const segments = parseSegments(content, streaming);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'markdown') {
          return <ChatMarkdown key={i} content={seg.text ?? ''} />;
        }
        if (seg.kind === 'block' && seg.block) {
          const block = seg.block;
          const Component = REGISTRY[block.type] as (
            props: typeof block.props,
          ) => ReactNode;
          return <Component key={i} {...block.props} />;
        }
        if (seg.kind === 'error' && seg.error) {
          return (
            <div
              key={i}
              className="tw-my-3 tw-rounded tw-border tw-border-[#fbeaea] tw-bg-[#fdf4f4] tw-px-3 tw-py-2 tw-text-xs tw-text-[#8a3a3a] tw-font-mono"
            >
              <div className="tw-font-semibold tw-mb-1">Block parse error</div>
              <div className="tw-opacity-80">{seg.error.message}</div>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
