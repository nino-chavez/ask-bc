'use client';

import { useEffect, useRef } from 'react';
import { Box, Text } from '@bigcommerce/big-design';
import type { UIMessage } from 'ai';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
  onFollowUp?: (text: string) => void;
}

export default function MessageList({ messages, isLoading, onFollowUp }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <Box
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '1rem',
      }}
    >
      {messages.length === 0 && !isLoading && (
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <Text color="secondary60">
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
        <Box style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <Box
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '1rem 1rem 1rem 0.25rem',
              background: '#f0f1f5',
              fontSize: '0.875rem',
              color: '#6b6f82',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#3C64F4',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            Thinking...
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
          </Box>
        </Box>
      )}
      <div ref={bottomRef} />
    </Box>
  );
}
