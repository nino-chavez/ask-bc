'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { Box, Text } from '@bigcommerce/big-design';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useTheme } from './ThemeContext';
import {
  saveSession,
  serializeMessages,
  titleFromStoredMessages,
} from '@/lib/chat-storage';
import type { ChatContext } from './ChatPage';

interface ChatPanelProps {
  sessionId: string;
  storeHash: string;
  context?: ChatContext;
  restoredMessages?: UIMessage[];
  starterPrompts: string[];
  onSessionSaved: () => void;
}

export default function ChatPanel({
  sessionId,
  storeHash,
  context,
  restoredMessages,
  starterPrompts,
  onSessionSaved,
}: ChatPanelProps) {
  const { theme } = useTheme();
  const { tokens, layout } = theme;

  const contentStyle: React.CSSProperties = layout.contentAlign === 'center'
    ? { maxWidth: layout.contentMaxWidth, margin: '0 auto', width: '100%' }
    : {};

  const prevCountRef = useRef(0);
  const hasRestored = useRef(false);

  const { messages, sendMessage, status, setMessages, error } = useChat({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: `/stores/${storeHash}/api/chat`,
      body: context ? { context } : undefined,
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Restore messages on mount
  useEffect(() => {
    if (restoredMessages && restoredMessages.length > 0 && !hasRestored.current) {
      hasRestored.current = true;
      setMessages(restoredMessages);
      prevCountRef.current = restoredMessages.length;
    }
  }, [restoredMessages, setMessages]);

  // Auto-save when message count changes (not on every render)
  useEffect(() => {
    if (messages.length === 0 || messages.length === prevCountRef.current) return;
    // Only save when not streaming (wait for complete messages)
    if (isLoading) return;

    prevCountRef.current = messages.length;
    const stored = serializeMessages(messages);
    if (stored.length === 0) return;

    saveSession({
      id: sessionId,
      storeHash,
      title: titleFromStoredMessages(stored),
      messages: stored,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).then(() => onSessionSaved()).catch(() => {});
  }, [messages, isLoading, sessionId, storeHash, onSessionSaved]);

  const handleSend = (text: string) => {
    sendMessage({ text });
  };

  return (
    <>
      {messages.length === 0 && !isLoading && (
        <Box
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: tokens.spacing.lg,
            background: tokens.colors.background,
            marginBottom: tokens.spacing.lg,
            ...contentStyle,
          }}
        >
          <Box style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <Text color="secondary60" style={{ marginBottom: '1rem' }}>
              {context
                ? `Ask anything about this ${context.type}.`
                : 'Ask a question about your store to get started.'}
            </Text>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {starterPrompts.map((prompt) => (
                <Box
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: `1px solid ${tokens.colors.border.default}`,
                    borderRadius: tokens.radius.md,
                    cursor: 'pointer',
                    fontSize: tokens.typography.fontSize.base,
                    color: tokens.colors.text.secondary,
                    textAlign: 'left',
                    background: tokens.colors.surfaceRaised,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = tokens.colors.primary;
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = tokens.colors.border.default;
                  }}
                >
                  {prompt}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {(messages.length > 0 || isLoading) && (
        <MessageList messages={messages} isLoading={isLoading} onFollowUp={handleSend} />
      )}

      {error && (
        <Box style={{
          ...contentStyle,
          padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
        }}>
          <Box style={{
            padding: '0.625rem 0.75rem',
            borderRadius: tokens.radius.md,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            fontSize: tokens.typography.fontSize.sm,
            color: '#991B1B',
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing.sm,
          }}>
            {error.message?.includes('429') || error.message?.includes('Too many')
              ? 'Too many requests — please wait a moment before sending another message.'
              : error.message?.includes('401') || error.message?.includes('Unauthorized')
                ? 'Your session has expired. Please reload the page to continue.'
                : 'Something went wrong. Please try again.'}
          </Box>
        </Box>
      )}

      <Box style={contentStyle}>
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          placeholder={context ? `Ask about this ${context.type}...` : 'Ask about your store...'}
        />
      </Box>
    </>
  );
}
