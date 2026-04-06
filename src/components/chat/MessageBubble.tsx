'use client';

import { Box, Text } from '@bigcommerce/big-design';
import type { UIMessage } from 'ai';

interface MessageBubbleProps {
  message: UIMessage;
}

const TOOL_LABELS: Record<string, string> = {
  get_store_info: 'store info',
  get_products: 'products',
  get_orders: 'orders',
  get_customers: 'customers',
  get_promotions: 'promotions',
  get_coupons: 'coupons',
  get_categories: 'categories',
  get_channels: 'channels',
  get_order_products: 'order items',
};

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // Collect tool invocations and text from message parts
  const toolCalls: { name: string; state: string }[] = [];
  const textParts: string[] = [];

  for (const part of message.parts || []) {
    if (part.type === 'text' && part.text.trim()) {
      textParts.push(part.text);
    } else if (part.type.startsWith('tool-')) {
      // v6 tool parts: type is `tool-${toolName}`, with toolCallId and state on the part
      const toolName = part.type.replace(/^tool-/, '');
      const toolPart = part as { type: string; state: string };
      toolCalls.push({
        name: toolName,
        state: toolPart.state,
      });
    }
  }

  const text = textParts.join('');

  if (!text && toolCalls.length === 0) return null;

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '1rem',
      }}
    >
      {toolCalls.length > 0 && (
        <Box style={{ marginBottom: '0.5rem' }}>
          {toolCalls.map((tc, i) => (
            <Text
              key={i}
              color="secondary60"
              style={{
                fontSize: '0.75rem',
                fontStyle: 'italic',
                marginBottom: '0.25rem',
              }}
            >
              {tc.state === 'output-available'
                ? `Looked up ${TOOL_LABELS[tc.name] || tc.name}`
                : `Looking up ${TOOL_LABELS[tc.name] || tc.name}...`}
            </Text>
          ))}
        </Box>
      )}
      {text && (
        <Box
          style={{
            maxWidth: '80%',
            padding: '0.75rem 1rem',
            borderRadius: isUser ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
            background: isUser ? '#3C64F4' : '#f0f1f5',
            color: isUser ? '#fff' : '#313440',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </Box>
      )}
    </Box>
  );
}
