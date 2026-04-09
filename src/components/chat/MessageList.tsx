'use client';

import { useEffect, useRef } from 'react';
import { Box, Text } from '@bigcommerce/big-design';
import type { UIMessage } from 'ai';
import { useTheme } from './ThemeContext';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
  onFollowUp?: (text: string) => void;
}

export default function MessageList({ messages, isLoading, onFollowUp }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { tokens, layout } = theme;
  const LoadingIndicator = theme.components.loadingIndicator;

  const contentStyle: React.CSSProperties = layout.contentAlign === 'center'
    ? { maxWidth: layout.contentMaxWidth, margin: '0 auto', width: '100%' }
    : {};

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <Box
      style={{
        flex: 1,
        overflow: 'auto',
        padding: tokens.spacing.lg,
        background: tokens.colors.background,
      }}
    >
      <Box style={contentStyle}>
        {messages.length === 0 && !isLoading && (
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Text style={{ color: tokens.colors.text.muted }}>
              Ask a question about your store to get started.
            </Text>
          </Box>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLatest={i === messages.length - 1 && !isLoading}
            onFollowUp={onFollowUp}
          />
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <LoadingIndicator />
        )}
        <div ref={bottomRef} />
      </Box>
    </Box>
  );
}
