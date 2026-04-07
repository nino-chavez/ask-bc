'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { Box, H1, Button, Text, Flex, FlexItem } from '@bigcommerce/big-design';
import { AddIcon, RestoreIcon, DeleteIcon, CloseIcon } from '@bigcommerce/big-design-icons';
import ChatPanel from './ChatPanel';
import {
  getSession,
  listSessions,
  deleteSession,
  deserializeMessages,
  type ChatSession,
} from '@/lib/chat-storage';

export interface ChatContext {
  type: 'order' | 'product' | 'section';
  id: string;
}

interface ChatPageProps {
  storeHash: string;
  context?: ChatContext;
}

function getStarterPrompts(context?: ChatContext): string[] {
  if (context?.type === 'order') {
    return [
      `What's the status of order #${context.id}?`,
      `What products are in order #${context.id}?`,
      `Is there anything unusual about order #${context.id}?`,
    ];
  }
  if (context?.type === 'product') {
    return [
      `Give me a summary of product #${context.id}`,
      `Is product #${context.id} visible on the storefront?`,
      `What category is product #${context.id} in?`,
    ];
  }
  return [
    'Give me a summary of my store',
    'Show me recent orders',
    'Do I have any active promotions?',
  ];
}

function getTitle(context?: ChatContext): string {
  if (context?.type === 'order') return `Order #${context.id}`;
  if (context?.type === 'product') return `Product #${context.id}`;
  return 'Ask BC';
}

function generateSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatPage({ storeHash, context }: ChatPageProps) {
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [restoredMessages, setRestoredMessages] = useState<UIMessage[] | undefined>();
  const isPanel = !!context;

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions(storeHash);
      setSessions(list);
    } catch { /* IndexedDB not available */ }
  }, [storeHash]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleNewConversation = () => {
    setSessionId(generateSessionId());
    setRestoredMessages(undefined);
  };

  const handleLoadSession = async (id: string) => {
    const session = await getSession(id);
    if (session) {
      setRestoredMessages(deserializeMessages(session.messages));
      setSessionId(session.id);
      setShowHistory(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (id === sessionId) {
      handleNewConversation();
    }
    refreshSessions();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Flex style={{ height: '100vh', overflow: 'hidden' }}>
      {/* History sidebar */}
      {showHistory && !isPanel && (
        <FlexItem
          style={{
            width: '260px',
            borderRight: '1px solid #d9dce9',
            display: 'flex',
            flexDirection: 'column',
            background: '#fafbfc',
          }}
        >
          <Box
            padding="small"
            style={{
              borderBottom: '1px solid #d9dce9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Chat History</Text>
            <Button
              variant="subtle"
              iconOnly={<CloseIcon />}
              onClick={() => setShowHistory(false)}
            />
          </Box>
          <Box style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
            {sessions.length === 0 && (
              <Text color="secondary60" style={{ fontSize: '0.8125rem', padding: '0.5rem', textAlign: 'center' }}>
                No past conversations.
              </Text>
            )}
            {sessions.map((s) => (
              <Box
                key={s.id}
                style={{
                  padding: '0.5rem 0.625rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: s.id === sessionId ? '#e9ebf5' : 'transparent',
                  marginBottom: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.375rem',
                }}
                onClick={() => handleLoadSession(s.id)}
              >
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: '0.8125rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                    }}
                  >
                    {s.title}
                  </Text>
                  <Text
                    color="secondary60"
                    style={{ fontSize: '0.6875rem' }}
                  >
                    {formatTime(s.updatedAt)}
                  </Text>
                </Box>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(s.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    borderRadius: '4px',
                    color: '#8b8fa3',
                    display: 'flex',
                    opacity: 0.5,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.5'; }}
                  title="Delete conversation"
                >
                  <DeleteIcon style={{ width: '14px', height: '14px' }} />
                </button>
              </Box>
            ))}
          </Box>
        </FlexItem>
      )}

      {/* Main chat area */}
      <FlexItem
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          padding={isPanel ? 'small' : 'medium'}
          style={{
            borderBottom: '1px solid #d9dce9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Flex alignItems="center" style={{ gap: '0.5rem' }}>
            {!isPanel && (
              <Button
                variant="subtle"
                iconOnly={<RestoreIcon />}
                onClick={() => setShowHistory(!showHistory)}
                title="Chat history"
              />
            )}
            <H1 style={{ margin: 0, fontSize: isPanel ? '1rem' : '1.25rem' }}>
              {getTitle(context)}
            </H1>
          </Flex>
          {!isPanel && (
            <Button
              variant="secondary"
              onClick={handleNewConversation}
              iconLeft={<AddIcon />}
            >
              New Chat
            </Button>
          )}
        </Box>

        {/* ChatPanel remounts on sessionId change via key */}
        <ChatPanel
          key={sessionId}
          sessionId={sessionId}
          storeHash={storeHash}
          context={context}
          restoredMessages={restoredMessages}
          starterPrompts={getStarterPrompts(context)}
          onSessionSaved={refreshSessions}
        />
      </FlexItem>
    </Flex>
  );
}
