'use client';

import { useState, useRef, useEffect, type FormEvent, type ReactNode } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat, getToolPartState, getToolCallId, getToolInput } from '@cloudflare/ai-chat/react';
import type { UIMessage } from 'ai';
import { BlockRenderer } from '@/components/chat/blocks';
import WriteApproval from '@/components/chat/blocks/WriteApproval';

/**
 * Reusable Worker-backed chat panel. Used by:
 * - /worker-chat (standalone demo page)
 * - /stores/[hash]/extensions/orders/[id] (order context)
 * - /stores/[hash]/extensions/products/[id] (product context)
 *
 * Connects to the Cloudflare Worker via WebSocket using the agents
 * protocol. Entity context (order/product) is passed via the body
 * param and injected into the system prompt on the Worker side.
 */

const WORKER_HOST = process.env.NEXT_PUBLIC_WORKER_HOST ?? 'localhost:8787';
const DEFAULT_STORE_HASH = 'cdfqf9k6zf';

export interface EntityContext {
  type: 'order' | 'product';
  id: string;
}

interface WorkerChatPanelProps {
  storeHash?: string;
  context?: EntityContext;
  suggestions?: string[];
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

const WRITE_TOOLS = new Set([
  'createCoupon',
  'updateProductInventory',
  'setProductVisibility',
  'updateProductPrice',
  'deleteCoupon',
]);

function getDefaultSuggestions(context?: EntityContext): string[] {
  if (context?.type === 'order') {
    return [
      `What's the status of order #${context.id}?`,
      `Show me the line items for order #${context.id}`,
      `Where is order #${context.id} being shipped?`,
    ];
  }
  if (context?.type === 'product') {
    return [
      `Give me details on product #${context.id}`,
      `What's the inventory level for product #${context.id}?`,
      `Is product #${context.id} visible on the storefront?`,
    ];
  }
  return [
    'Give me a KPI summary of my store',
    'Show me my 5 most expensive products',
    'Which products are low on inventory?',
  ];
}

export default function WorkerChatPanel({
  storeHash = DEFAULT_STORE_HASH,
  context,
  suggestions,
  title = 'Ask BC',
  subtitle = 'Cloudflare Worker · Codemode · Generative UI',
  compact = false,
}: WorkerChatPanelProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const effectiveSuggestions = suggestions ?? getDefaultSuggestions(context);

  const agent = useAgent({
    host: WORKER_HOST,
    agent: 'AskBC',
    name: storeHash,
  });

  const chat = useAgentChat({
    agent,
    body: context ? { entityContext: context } : undefined,
  });

  const { messages, sendMessage, status, addToolOutput, clearHistory } = chat;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || status !== 'ready') return;
    sendMessage({ role: 'user', parts: [{ type: 'text', text: input }] });
    setInput('');
  }

  function handleSuggestion(text: string) {
    if (status !== 'ready') return;
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] });
  }

  function approveTool(toolCallId: string) {
    addToolOutput({ toolCallId, approved: true } as never);
  }
  function denyTool(toolCallId: string) {
    addToolOutput({ toolCallId, approved: false } as never);
  }

  const isLoading = status === 'submitted' || status === 'streaming';
  const isConnected = agent.identified;
  const headerPad = compact ? '0.75rem 1rem' : '1rem 1.5rem';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fafbfc', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: '#313440' }}>
      <header style={{ padding: headerPad, borderBottom: '1px solid #e8e9ef', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: compact ? '0.875rem' : '1rem', fontWeight: 600 }}>{title}</h1>
          <div style={{ fontSize: '0.75rem', color: '#737585', marginTop: 2 }}>
            {subtitle}
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: isConnected ? '#0c8a5a' : '#c42a2a', marginLeft: 8, verticalAlign: 'middle' }} title={isConnected ? 'Connected' : 'Disconnected'} />
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearHistory} style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: 6, border: '1px solid #d9dce9', background: 'white', color: '#525566', cursor: 'pointer' }}>Clear</button>
        )}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '1rem' : '1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {messages.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '0.9375rem', color: '#737585', marginBottom: '1.5rem' }}>Ask about your store to get started.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                {effectiveSuggestions.map((s) => (
                  <button key={s} onClick={() => handleSuggestion(s)} disabled={!isConnected} style={{ background: 'white', border: '1px solid #d9dce9', borderRadius: 999, padding: '0.5rem 1rem', fontSize: '0.8125rem', color: '#525566', cursor: isConnected ? 'pointer' : 'wait', opacity: isConnected ? 1 : 0.5 }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageView key={m.id} message={m} streaming={isLoading && i === messages.length - 1} onApprove={approveTool} onDeny={denyTool} />
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '0.375rem', padding: '0.5rem 0' }}>
              {[0, 150, 300].map((delay) => (
                <div key={delay} style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b8e9c', animation: 'pulse 1.4s ease-in-out infinite', animationDelay: `${delay}ms` }} />
              ))}
              <style>{`@keyframes pulse { 0%, 60%, 100% { opacity: 0.3; transform: scale(1); } 30% { opacity: 1; transform: scale(1.2); } }`}</style>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: headerPad, borderTop: '1px solid #e8e9ef', background: 'white' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: '0.5rem' }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={isConnected ? 'Ask about your store...' : 'Connecting...'} disabled={!isConnected || isLoading} style={{ flex: 1, padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #d9dce9', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', background: isLoading ? '#fafbfc' : 'white' }} onFocus={(e) => (e.target.style.borderColor = '#3C64F4')} onBlur={(e) => (e.target.style.borderColor = '#d9dce9')} />
          <button type="submit" disabled={isLoading || !isConnected || !input.trim()} style={{ padding: '0.625rem 1.25rem', borderRadius: 8, border: 'none', background: isLoading || !isConnected || !input.trim() ? '#d9dce9' : '#3C64F4', color: 'white', fontSize: '0.875rem', fontWeight: 500, cursor: isLoading || !isConnected || !input.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageView({ message, streaming, onApprove, onDeny }: { message: UIMessage; streaming?: boolean; onApprove: (id: string) => void; onDeny: (id: string) => void }) {
  if (message.role === 'user') {
    const text = message.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('');
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
        <div style={{ background: '#3C64F4', color: 'white', padding: '0.625rem 1rem', borderRadius: '1rem 1rem 0.25rem 1rem', maxWidth: '80%', fontSize: '0.875rem', lineHeight: 1.45 }}>{text}</div>
      </div>
    );
  }

  const rendered: ReactNode[] = [];
  let textBuffer = '';
  let key = 0;

  const flushText = () => {
    if (!textBuffer.length) return;
    rendered.push(<BlockRenderer key={key++} content={textBuffer} streaming={streaming} />);
    textBuffer = '';
  };

  for (const part of message.parts) {
    if (part.type === 'text') { textBuffer += part.text; continue; }
    const partType = (part as { type: string }).type;
    if (partType.startsWith('tool-')) {
      const toolName = partType.slice('tool-'.length);
      if (WRITE_TOOLS.has(toolName)) {
        flushText();
        const state = getToolPartState(part);
        const toolCallId = getToolCallId(part);
        const input = getToolInput(part);
        const mappedState = state === 'waiting-approval' ? 'waiting-approval' : state === 'complete' ? 'complete' : state === 'denied' || state === 'error' ? 'denied' : 'waiting-approval';
        rendered.push(<WriteApproval key={key++} toolCallId={toolCallId} toolName={toolName} input={input} state={mappedState} onApprove={onApprove} onDeny={onDeny} />);
      }
    }
  }
  flushText();
  return <div style={{ marginBottom: '1.75rem' }}>{rendered}</div>;
}
