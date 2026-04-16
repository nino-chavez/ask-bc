'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent, type ReactNode } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat, getToolPartState, getToolCallId, getToolInput } from '@cloudflare/ai-chat/react';
import type { UIMessage } from 'ai';
import { BlockRenderer } from '@/components/chat/blocks';
import WriteApproval from '@/components/chat/blocks/WriteApproval';

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
  'createCoupon', 'updateProductInventory', 'setProductVisibility',
  'updateProductPrice', 'deleteCoupon', 'updateOrderStatus', 'createProduct',
]);

const ALL_TOOL_LABELS: Record<string, string> = {
  execute: 'code execution', getProducts: 'products', getProduct: 'product',
  getProductVariants: 'variants', getCategories: 'categories', getBrands: 'brands',
  getOrders: 'orders', getOrder: 'order', getOrderProducts: 'order items',
  getOrderCount: 'order count', getOrderShippingAddresses: 'shipping',
  getOrderRefunds: 'refunds', getCustomers: 'customers',
  getCustomerAddresses: 'addresses', getStoreInfo: 'store info',
  getShippingZones: 'shipping zones', getShippingMethods: 'shipping methods',
  getTaxSettings: 'tax settings', getInventoryLocations: 'inventory',
  getPromotions: 'promotions', getCoupons: 'coupons', getChannels: 'channels',
  searchDocumentation: 'help docs', createCoupon: 'create coupon',
  updateProductInventory: 'update inventory', setProductVisibility: 'set visibility',
  updateProductPrice: 'update price', deleteCoupon: 'delete coupon',
  updateOrderStatus: 'update order', createProduct: 'create product',
};

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

// Follow-up suggestions based on response content
function generateFollowUps(text: string): string[] {
  const lower = text.toLowerCase();
  const suggestions: string[] = [];

  if (lower.includes('order') && lower.includes('#')) {
    const m = text.match(/#(\d+)/);
    if (m) {
      suggestions.push(`What products are in order #${m[1]}?`);
      suggestions.push(`Where is order #${m[1]} being shipped?`);
    }
  } else if (lower.includes('product') && (lower.includes('$') || lower.includes('price') || lower.includes('inventory'))) {
    suggestions.push('Which products are low on inventory?');
    suggestions.push('Show me products not visible on the storefront');
  } else if (lower.includes('promotion') || lower.includes('coupon') || lower.includes('discount')) {
    suggestions.push('Are any of these expired or inactive?');
    suggestions.push('How do I create a new promotion?');
  } else if (lower.includes('shipping') || lower.includes('delivery')) {
    suggestions.push('How do I set up free shipping?');
    suggestions.push('Show me my shipping zones');
  } else if (lower.includes('customer')) {
    suggestions.push('Who are my most recent customers?');
    suggestions.push('How do I set up customer groups?');
  } else if (lower.includes('store') && (lower.includes('summary') || lower.includes('overview') || lower.includes('kpi'))) {
    suggestions.push('Show me recent orders');
    suggestions.push('Do I have any active promotions?');
    suggestions.push('How is my shipping configured?');
  } else {
    suggestions.push('Give me a KPI summary of my store');
  }

  return suggestions.slice(0, 3);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function WorkerChatPanel({
  storeHash = DEFAULT_STORE_HASH,
  context,
  suggestions,
  title = 'Ask BC',
  subtitle = 'AI Store Assistant',
  compact = false,
}: WorkerChatPanelProps) {
  const [input, setInput] = useState('');
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const effectiveSuggestions = suggestions ?? getDefaultSuggestions(context);

  useEffect(() => {
    fetch(`/stores/${storeHash}/api/agent-token`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.token) setAgentToken(data.token); })
      .catch(() => { setAgentToken('none'); });
  }, [storeHash]);

  const agent = useAgent({
    host: WORKER_HOST,
    agent: 'AskBC',
    name: storeHash,
    query: agentToken && agentToken !== 'none' ? { token: agentToken } : undefined,
    enabled: agentToken !== null,
  } as Parameters<typeof useAgent>[0]);

  const chat = useAgentChat({ agent, body: context ? { entityContext: context } : undefined });
  const { messages, sendMessage, status, addToolOutput, clearHistory } = chat;

  const isLoading = status === 'submitted' || status === 'streaming';
  const isStreaming = status === 'streaming';
  const isConnected = agent.identified;
  const pad = compact ? '0.75rem 1rem' : '1rem 1.5rem';

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Scroll-to-bottom detection
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }, []);

  function scrollToBottom() {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

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

  function approveTool(id: string) { addToolOutput({ toolCallId: id, approved: true } as never); }
  function denyTool(id: string) { addToolOutput({ toolCallId: id, approved: false } as never); }

  const lastAssistantText = messages.filter(m => m.role === 'assistant').at(-1)?.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text).join('') ?? '';
  const followUps = !isLoading && messages.length > 0 ? generateFollowUps(lastAssistantText) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fafbfc', fontFamily: "'Source Sans 3', 'Source Sans Pro', 'Helvetica Neue', Arial, sans-serif", color: '#313440' }}>
      {/* Header */}
      <header style={{ padding: pad, borderBottom: '1px solid #e8e9ef', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: compact ? '0.875rem' : '1rem', fontWeight: 600 }}>{title}</h1>
          <div style={{ fontSize: '0.75rem', color: '#737585', marginTop: 2 }}>
            {subtitle}
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: isConnected ? '#0c8a5a' : '#c42a2a', marginLeft: 8, verticalAlign: 'middle' }} title={isConnected ? 'Connected' : 'Reconnecting...'} />
            {!isConnected && <span style={{ fontSize: '0.6875rem', color: '#c42a2a', marginLeft: 4 }}>Reconnecting...</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {messages.length > 0 && (
            <button onClick={clearHistory} style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: 6, border: '1px solid #d9dce9', background: 'white', color: '#525566', cursor: 'pointer' }}>New Chat</button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: compact ? '1rem' : '1.5rem', position: 'relative' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {messages.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '0.9375rem', color: '#737585', marginBottom: '1.5rem' }}>Ask about your store to get started.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                {effectiveSuggestions.map((s) => (
                  <SuggestionChip key={s} text={s} onClick={handleSuggestion} disabled={!isConnected} />
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageView
              key={m.id}
              message={m}
              streaming={isStreaming && i === messages.length - 1}
              isLatest={i === messages.length - 1}
              onApprove={approveTool}
              onDeny={denyTool}
              onFollowUp={handleSuggestion}
            />
          ))}

          {/* Activity indicator */}
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0', color: '#8b8e9c', fontSize: '0.8125rem' }}>
              <span className="tw-animate-pulse" style={{ display: 'flex', gap: 3 }}>
                {[0, 150, 300].map((d) => (
                  <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: '#8b8e9c', animation: 'pulse 1.4s ease-in-out infinite', animationDelay: `${d}ms` }} />
                ))}
              </span>
              <span>{isStreaming ? 'Generating response...' : 'Thinking...'}</span>
              <style>{`@keyframes pulse { 0%, 60%, 100% { opacity: 0.3; transform: scale(1); } 30% { opacity: 1; transform: scale(1.2); } }`}</style>
            </div>
          )}

          {/* Follow-up suggestions */}
          {followUps.length > 0 && !isLoading && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 16 }}>
              {followUps.map((s) => (
                <SuggestionChip key={s} text={s} onClick={handleSuggestion} disabled={!isConnected} small />
              ))}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Scroll-to-bottom */}
        {showScrollBtn && (
          <button onClick={scrollToBottom} style={{ position: 'sticky', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: '50%', border: '1px solid #d9dce9', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#525566' }}>
            ↓
          </button>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: pad, borderTop: '1px solid #e8e9ef', background: 'white' }}>
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

// ─── Suggestion chip ──────────────────────────────────────────────

function SuggestionChip({ text, onClick, disabled, small }: { text: string; onClick: (t: string) => void; disabled?: boolean; small?: boolean }) {
  return (
    <button
      onClick={() => onClick(text)}
      disabled={disabled}
      style={{
        background: 'white', border: '1px solid #d9dce9', borderRadius: 999,
        padding: small ? '0.375rem 0.75rem' : '0.5rem 1rem',
        fontSize: small ? '0.75rem' : '0.8125rem',
        color: '#525566', cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = '#3C64F4'; e.currentTarget.style.color = '#3C64F4'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d9dce9'; e.currentTarget.style.color = '#525566'; }}
    >
      {text}
    </button>
  );
}

// ─── Message view ──────────────────────────────────────────────────

interface MessageViewProps {
  message: UIMessage;
  streaming?: boolean;
  isLatest?: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onFollowUp: (text: string) => void;
}

function MessageView({ message, streaming, onApprove, onDeny }: MessageViewProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showTools, setShowTools] = useState(false);

  if (message.role === 'user') {
    const text = message.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('');
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
        <div style={{ background: '#3C64F4', color: 'white', padding: '0.625rem 1rem', borderRadius: '1rem 1rem 0.25rem 1rem', maxWidth: '80%', fontSize: '0.875rem', lineHeight: 1.45 }}>
          {text}
          <div style={{ fontSize: '0.6875rem', opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{formatTime(new Date())}</div>
        </div>
      </div>
    );
  }

  // Collect text + tool info
  const rendered: ReactNode[] = [];
  let textBuffer = '';
  let fullText = '';
  let key = 0;
  const toolParts: { name: string; state: string }[] = [];

  const flushText = () => {
    if (!textBuffer.length) return;
    rendered.push(<BlockRenderer key={key++} content={textBuffer} streaming={streaming} />);
    textBuffer = '';
  };

  for (const part of message.parts) {
    if (part.type === 'text') {
      textBuffer += part.text;
      fullText += part.text;
      continue;
    }
    const partType = (part as { type: string }).type;
    if (partType.startsWith('tool-')) {
      const toolName = partType.slice('tool-'.length);
      const state = getToolPartState(part);
      toolParts.push({ name: toolName, state });

      if (WRITE_TOOLS.has(toolName)) {
        flushText();
        const toolCallId = getToolCallId(part);
        const input = getToolInput(part);
        const mappedState = state === 'waiting-approval' ? 'waiting-approval' : state === 'complete' ? 'complete' : state === 'denied' || state === 'error' ? 'denied' : 'waiting-approval';
        rendered.push(<WriteApproval key={key++} toolCallId={toolCallId} toolName={toolName} input={input} state={mappedState} onApprove={onApprove} onDeny={onDeny} />);
      }
    }
  }
  flushText();

  const completedTools = toolParts.filter(t => t.state === 'complete' || t.state === 'streaming');

  async function copyText() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available in iframe */ }
  }

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* Tool usage indicator */}
      {completedTools.length > 0 && (
        <button
          onClick={() => setShowTools(!showTools)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#8b8e9c', padding: '2px 0', marginBottom: 6 }}
        >
          <span style={{ transition: 'transform 0.15s', transform: showTools ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>&#9654;</span>
          Used {completedTools.length} tool{completedTools.length > 1 ? 's' : ''}
        </button>
      )}
      {showTools && completedTools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {completedTools.map((t, i) => (
            <span key={i} style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 4, background: '#f0f1f5', color: '#525566' }}>
              {ALL_TOOL_LABELS[t.name] ?? t.name}
            </span>
          ))}
        </div>
      )}

      {/* Response content */}
      {rendered}

      {/* Actions: copy + feedback */}
      {!streaming && fullText.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <button onClick={copyText} title="Copy response" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: copied ? '#0c8a5a' : '#8b8e9c', padding: '2px 4px' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <span style={{ color: '#e8e9ef' }}>|</span>
          <button onClick={() => setFeedback(feedback === 'up' ? null : 'up')} title="Good response" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', padding: '2px 4px', color: feedback === 'up' ? '#0c8a5a' : '#c4c6d1' }}>
            {feedback === 'up' ? '▲' : '△'}
          </button>
          <button onClick={() => setFeedback(feedback === 'down' ? null : 'down')} title="Bad response" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', padding: '2px 4px', color: feedback === 'down' ? '#c42a2a' : '#c4c6d1' }}>
            {feedback === 'down' ? '▼' : '▽'}
          </button>
        </div>
      )}
    </div>
  );
}
