'use client';

import { useEffect, useRef } from 'react';
import { Box, Text } from '@bigcommerce/big-design';
import type { UIMessage } from 'ai';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
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
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
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
            }}
          >
            Thinking...
          </Box>
        </Box>
      )}
      <div ref={bottomRef} />
    </Box>
  );
}
