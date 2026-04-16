'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat, getToolPartState, getToolCallId, getToolInput } from '@cloudflare/ai-chat/react';
import type { UIMessage } from 'ai';
import { BlockRenderer } from '@/components/chat/blocks';
import WriteApproval from '@/components/chat/blocks/WriteApproval';

/**
 * Worker-backed chat surface using the native agents WebSocket protocol
 * via useAgent + useAgentChat. Connects directly browser → Worker on
 * localhost:8787, bypassing the Next.js API layer. This is the path
 * that enables streaming, stream resumption, and — most importantly —
 * native server-side tool approval via CF_AGENT_TOOL_APPROVAL events.
 *
 * When a write tool is invoked, the server pauses the turn and the
 * AI SDK surfaces the tool part in `waiting-approval` state. The
 * WriteApproval component renders Execute/Cancel buttons; clicking
 * Execute calls addToolOutput with approved: true, the server resumes,
 * and Think's beforeTurn(continuation: true) hook upgrades the model
 * to Sonnet 4.6 for the post-approval reasoning.
 */

const WORKER_HOST = process.env.NEXT_PUBLIC_WORKER_HOST ?? 'localhost:8787';

const SUGGESTIONS = [
  'Give me a KPI summary of my store',
  'Show me my 5 most expensive products',
  'Which products are low on inventory?',
  'Create a coupon called SUMMER25 for 25% off',
  'Set the Carmel Leather Sectional to hidden on the storefront',
];

export default function WorkerChatPage() {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    host: WORKER_HOST,
    agent: 'AskBC',
    name: 'cdfqf9k6zf',
  });

  const chat = useAgentChat({
    agent,
  });

  const { messages, sendMessage, status, addToolOutput, clearHistory } = chat;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || status !== 'ready') return;
    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: input }],
    });
    setInput('');
  }

  function handleSuggestion(text: string) {
    if (status !== 'ready') return;
    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text }],
    });
  }

  function approveTool(toolCallId: string) {
    addToolOutput({
      toolCallId,
      approved: true,
    } as never);
  }

  function denyTool(toolCallId: string) {
    addToolOutput({
      toolCallId,
      approved: false,
    } as never);
  }

  const isLoading = status === 'submitted' || status === 'streaming';
  const isConnected = agent.identified;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#fafbfc',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        color: '#313440',
      }}
    >
      <header
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e8e9ef',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Ask BC</h1>
          <div style={{ fontSize: '0.75rem', color: '#737585', marginTop: 2 }}>
            Cloudflare Worker · Codemode · Generative UI
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isConnected ? '#0c8a5a' : '#c42a2a',
                marginLeft: 8,
                verticalAlign: 'middle',
              }}
              title={isConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {messages.length > 0 && (
            <>
              <div style={{ fontSize: '0.75rem', color: '#737585' }}>
                {messages.length} messages
              </div>
              <button
                onClick={clearHistory}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.625rem',
                  borderRadius: 6,
                  border: '1px solid #d9dce9',
                  background: 'white',
                  color: '#525566',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {messages.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div
                style={{
                  fontSize: '0.9375rem',
                  color: '#737585',
                  marginBottom: '1.5rem',
                }}
              >
                Ask about your store to get started.
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  alignItems: 'center',
                }}
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    disabled={!isConnected}
                    style={{
                      background: 'white',
                      border: '1px solid #d9dce9',
                      borderRadius: 999,
                      padding: '0.5rem 1rem',
                      fontSize: '0.8125rem',
                      color: '#525566',
                      cursor: isConnected ? 'pointer' : 'wait',
                      opacity: isConnected ? 1 : 0.5,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isConnected) return;
                      e.currentTarget.style.borderColor = '#3C64F4';
                      e.currentTarget.style.color = '#3C64F4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#d9dce9';
                      e.currentTarget.style.color = '#525566';
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageView
              key={m.id}
              message={m}
              streaming={isLoading && i === messages.length - 1}
              onApprove={approveTool}
              onDeny={denyTool}
            />
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '0.375rem', padding: '0.5rem 0' }}>
              {[0, 150, 300].map((delay) => (
                <div
                  key={delay}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#8b8e9c',
                    animation: 'pulse 1.4s ease-in-out infinite',
                    animationDelay: `${delay}ms`,
                  }}
                />
              ))}
              <style>{`
                @keyframes pulse {
                  0%, 60%, 100% { opacity: 0.3; transform: scale(1); }
                  30% { opacity: 1; transform: scale(1.2); }
                }
              `}</style>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e8e9ef',
          background: 'white',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            gap: '0.5rem',
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isConnected ? 'Ask about your store...' : 'Connecting to agent...'}
            disabled={!isConnected || isLoading}
            style={{
              flex: 1,
              padding: '0.625rem 1rem',
              borderRadius: 8,
              border: '1px solid #d9dce9',
              fontSize: '0.875rem',
              outline: 'none',
              fontFamily: 'inherit',
              background: isLoading ? '#fafbfc' : 'white',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3C64F4')}
            onBlur={(e) => (e.target.style.borderColor = '#d9dce9')}
          />
          <button
            type="submit"
            disabled={isLoading || !isConnected || !input.trim()}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              background: isLoading || !isConnected || !input.trim() ? '#d9dce9' : '#3C64F4',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isLoading || !isConnected || !input.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {isLoading ? 'Thinking…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface MessageViewProps {
  message: UIMessage;
  streaming?: boolean;
  onApprove: (toolCallId: string) => void;
  onDeny: (toolCallId: string) => void;
}

/**
 * Walk a UIMessage's parts array. For each part:
 *  - text → accumulate into a running markdown string, flush when a
 *    non-text part breaks the run
 *  - tool-* → if the tool is a known write tool in waiting-approval
 *    state, render a WriteApproval card; otherwise skip (the sandbox
 *    execute tool's internal state isn't merchant-facing)
 *
 * Text segments run through BlockRenderer so any fenced ```block``` JSON
 * the model emitted becomes a real React component inline.
 */
function MessageView({ message, streaming, onApprove, onDeny }: MessageViewProps) {
  if (message.role === 'user') {
    const text = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            background: '#3C64F4',
            color: 'white',
            padding: '0.625rem 1rem',
            borderRadius: '1rem 1rem 0.25rem 1rem',
            maxWidth: '80%',
            fontSize: '0.875rem',
            lineHeight: 1.45,
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  // Assistant message — walk parts, interleave text and tool cards
  const rendered: React.ReactNode[] = [];
  let textBuffer = '';
  let key = 0;

  const flushText = () => {
    if (textBuffer.length === 0) return;
    rendered.push(<BlockRenderer key={key++} content={textBuffer} streaming={streaming} />);
    textBuffer = '';
  };

  for (const part of message.parts) {
    if (part.type === 'text') {
      textBuffer += part.text;
      continue;
    }

    // Any tool part — check if it's a write tool in approval state
    const partType = (part as { type: string }).type;
    if (partType.startsWith('tool-')) {
      const toolName = partType.slice('tool-'.length);
      const writeToolNames = new Set([
        'createCoupon',
        'updateProductInventory',
        'setProductVisibility',
        'updateProductPrice',
      ]);

      if (writeToolNames.has(toolName)) {
        flushText();
        const state = getToolPartState(part);
        const toolCallId = getToolCallId(part);
        const input = getToolInput(part);
        const mappedState =
          state === 'waiting-approval'
            ? 'waiting-approval'
            : state === 'complete'
              ? 'complete'
              : state === 'approved'
                ? 'waiting-approval' // still running after approval
                : state === 'denied' || state === 'error'
                  ? 'denied'
                  : state === 'loading' || state === 'streaming'
                    ? 'waiting-approval'
                    : 'waiting-approval'; // unknown: safer to show pending than fake-complete
        rendered.push(
          <WriteApproval
            key={key++}
            toolCallId={toolCallId}
            toolName={toolName}
            input={input}
            state={mappedState}
            onApprove={onApprove}
            onDeny={onDeny}
          />,
        );
      }
      // Non-write tool parts (execute, etc) — skip, not merchant-facing
    }
  }

  flushText();

  return <div style={{ marginBottom: '1.75rem' }}>{rendered}</div>;
}
