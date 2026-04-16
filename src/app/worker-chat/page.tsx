'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { BlockRenderer } from '@/components/chat/blocks';

/**
 * Dev-only chat surface that talks to the Cloudflare Worker agent
 * runtime via /api/worker-proxy. Uses the BlockRenderer so responses
 * with fenced `block` code segments render as real React components
 * inline with the text.
 *
 * This page is the demo surface for the Codemode + Generative UI
 * migration. It bypasses BC OAuth and the iframe shell — just plain
 * chat + blocks against the Worker's /smoke endpoint.
 *
 * Visit /worker-chat with the Worker running at localhost:8787
 * (wrangler dev in workers/agent-runtime/).
 */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelsUsed?: string[];
  durationMs?: number;
}

interface WorkerResponse {
  text: string;
  modelsUsed?: string[];
  toolCalls?: unknown[];
  timedOut?: boolean;
  error?: string;
  detail?: string;
  hint?: string;
}

const SUGGESTIONS = [
  'Give me a KPI summary of my store',
  'Show me my 5 most expensive products',
  'What are my 5 most recent completed orders with line items?',
  'Which products are low on inventory?',
  'Break down customers by order frequency',
];

export default function WorkerChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    setInput('');

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const started = Date.now();
    try {
      const res = await fetch('/api/worker-proxy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as WorkerResponse;

      if (!res.ok || data.error) {
        const msg = [data.error, data.detail, data.hint].filter(Boolean).join(' — ');
        setError(msg || `Worker returned ${res.status}`);
        setLoading(false);
        return;
      }

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.text,
        modelsUsed: data.modelsUsed,
        durationMs: Date.now() - started,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

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
      {/* Header */}
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
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#737585' }}>
          {messages.length > 0 && `${messages.length} messages`}
        </div>
      </header>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {messages.length === 0 && !loading && (
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
                    onClick={() => void send(s)}
                    style={{
                      background: 'white',
                      border: '1px solid #d9dce9',
                      borderRadius: 999,
                      padding: '0.5rem 1rem',
                      fontSize: '0.8125rem',
                      color: '#525566',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
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

          {messages.map((m) =>
            m.role === 'user' ? (
              <div
                key={m.id}
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
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} style={{ marginBottom: '1.75rem' }}>
                <BlockRenderer content={m.content} />
                {(m.durationMs !== undefined || m.modelsUsed) && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.6875rem',
                      color: '#8b8e9c',
                      fontFamily:
                        'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    }}
                  >
                    {m.modelsUsed?.join(' → ')}
                    {m.durationMs !== undefined &&
                      ` · ${(m.durationMs / 1000).toFixed(1)}s`}
                  </div>
                )}
              </div>
            ),
          )}

          {loading && (
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

          {error && (
            <div
              style={{
                background: '#fdf4f4',
                border: '1px solid #fbeaea',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                fontSize: '0.8125rem',
                color: '#8a3a3a',
                marginBottom: '1rem',
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
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
            placeholder="Ask about your store..."
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.625rem 1rem',
              borderRadius: 8,
              border: '1px solid #d9dce9',
              fontSize: '0.875rem',
              outline: 'none',
              fontFamily: 'inherit',
              background: loading ? '#fafbfc' : 'white',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3C64F4')}
            onBlur={(e) => (e.target.style.borderColor = '#d9dce9')}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              background: loading || !input.trim() ? '#d9dce9' : '#3C64F4',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
