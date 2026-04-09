'use client';

import { useState, type ReactElement } from 'react';
import { Box, Text } from '@bigcommerce/big-design';
import {
  StoreIcon,
  ProductsIcon,
  ReceiptIcon,
  PublicIcon,
  FolderIcon,
  SearchIcon,
  SettingsIcon,
  LanguageIcon,
  AssignmentIcon,
  ContentCopyIcon,
  CheckCircleIcon,
  ThumbUpAltIcon,
  ThumbUpOffAltIcon,
  ThumbDownAltIcon,
  ThumbDownOffAltIcon,
  ExpandMoreIcon,
  AutoAwesomeIcon,
  InsertChartIcon,
  BaselineHelpIcon,
} from '@bigcommerce/big-design-icons';
import type { UIMessage } from 'ai';
import ChatMarkdown from './ChatMarkdown';
import { useTheme } from './ThemeContext';

interface MessageBubbleProps {
  message: UIMessage;
  onFollowUp?: (text: string) => void;
  isLatest?: boolean;
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
  get_product_variants: 'product variants',
  get_order_shipping_addresses: 'shipping addresses',
  get_shipping_zones: 'shipping zones',
  get_tax_settings: 'tax settings',
  get_inventory: 'inventory levels',
  search_documentation: 'help docs',
};

const iconStyle = { fontSize: '1rem', width: '16px', height: '16px' };

const TOOL_ICONS: Record<string, ReactElement> = {
  get_store_info: <StoreIcon style={iconStyle} />,
  get_products: <ProductsIcon style={iconStyle} />,
  get_orders: <ReceiptIcon style={iconStyle} />,
  get_customers: <PublicIcon style={iconStyle} />,
  get_promotions: <AutoAwesomeIcon style={iconStyle} />,
  get_coupons: <AutoAwesomeIcon style={iconStyle} />,
  get_categories: <FolderIcon style={iconStyle} />,
  get_channels: <LanguageIcon style={iconStyle} />,
  get_order_products: <AssignmentIcon style={iconStyle} />,
  get_product_variants: <ProductsIcon style={iconStyle} />,
  get_order_shipping_addresses: <PublicIcon style={iconStyle} />,
  get_shipping_zones: <PublicIcon style={iconStyle} />,
  get_tax_settings: <SettingsIcon style={iconStyle} />,
  get_inventory: <InsertChartIcon style={iconStyle} />,
  search_documentation: <BaselineHelpIcon style={iconStyle} />,
};

function generateFollowUps(text: string): string[] {
  const lower = text.toLowerCase();
  const suggestions: string[] = [];

  // Check all patterns (not exclusive — collect from multiple)
  if (lower.includes('order') && text.match(/#(\d+)/)) {
    const orderMatch = text.match(/#(\d+)/);
    suggestions.push(`What products are in order #${orderMatch![1]}?`);
    suggestions.push(`Where is order #${orderMatch![1]} being shipped?`);
  }
  if (lower.includes('product') && (lower.includes('$') || lower.includes('price') || lower.includes('catalog'))) {
    suggestions.push('Which products are low on inventory?');
    suggestions.push('Show me products not visible on the storefront');
  }
  if (lower.includes('promotion') || lower.includes('coupon') || lower.includes('discount')) {
    suggestions.push('Are any of these expired or inactive?');
    suggestions.push('How do I create a new promotion?');
  }
  if (lower.includes('shipping') || lower.includes('delivery')) {
    suggestions.push('How do I set up free shipping?');
  }
  if (lower.includes('customer')) {
    suggestions.push('Who are my most recent customers?');
  }

  // Always provide fallback suggestions if nothing matched
  if (suggestions.length === 0) {
    if (lower.includes('store') || lower.includes('domain') || lower.includes('plan')) {
      suggestions.push('Show me recent orders');
      suggestions.push('Do I have any active promotions?');
      suggestions.push('How is my shipping configured?');
    } else {
      suggestions.push('Tell me more');
      suggestions.push('Show me recent orders');
      suggestions.push('Do I have any active promotions?');
    }
  }

  return suggestions.slice(0, 3);
}

export default function MessageBubble({ message, onFollowUp, isLatest }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const sendFeedback = (rating: 'up' | 'down') => {
    // Extract storeHash from URL: /stores/[storeHash]/...
    const match = window.location.pathname.match(/\/stores\/([^/]+)/);
    if (!match) return;
    fetch(`/stores/${match[1]}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, rating }),
    }).catch(() => {});
  };
  const [showTools, setShowTools] = useState(false);

  const { theme } = useTheme();
  const { tokens, layout } = theme;
  const ToolResultRenderer = theme.components.toolResultRenderer;

  const toolCalls: { name: string; state: string; output?: unknown }[] = [];
  const textParts: string[] = [];

  for (const part of message.parts || []) {
    if (part.type === 'text' && part.text.trim()) {
      textParts.push(part.text);
    } else if (part.type.startsWith('tool-')) {
      const toolName = part.type.replace(/^tool-/, '');
      const toolPart = part as { type: string; state: string; output?: unknown };
      toolCalls.push({ name: toolName, state: toolPart.state, output: toolPart.output });
    }
  }

  const text = textParts.join('');
  if (!text && toolCalls.length === 0) return null;

  const completedTools = toolCalls.filter((t) => t.state === 'output-available');
  const pendingTools = toolCalls.filter((t) => t.state !== 'output-available');
  const toolsWithOutput = completedTools.filter((t) => t.output);
  const followUps = isLatest && !isUser && text ? generateFollowUps(text) : [];

  // Compute bubble styles from theme tokens
  const bubbleStyle = isUser
    ? {
        background: tokens.colors.userBubble.bg,
        color: tokens.colors.userBubble.text,
        borderRadius: tokens.radius.userBubble,
        ...(tokens.colors.userBubble.border
          ? { border: `1px solid ${tokens.colors.userBubble.border}` }
          : {}),
        maxWidth: '85%',
        padding: '0.75rem 1rem',
        fontSize: tokens.typography.fontSize.sm,
        lineHeight: '1.5',
        wordBreak: 'break-word' as const,
        whiteSpace: 'pre-wrap' as const,
      }
    : {
        background: tokens.colors.assistantBubble.bg,
        color: tokens.colors.assistantBubble.text,
        borderRadius: tokens.radius.assistantBubble,
        ...(tokens.colors.assistantBubble.border
          ? { border: `1px solid ${tokens.colors.assistantBubble.border}` }
          : {}),
        maxWidth: '85%',
        padding: tokens.colors.assistantBubble.bg === 'transparent' ? '0.25rem 0' : '0.75rem 1rem',
        fontSize: tokens.typography.fontSize.sm,
        lineHeight: '1.5',
        wordBreak: 'break-word' as const,
      };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: tokens.spacing.lg,
      }}
    >
      {/* Pending tool calls — animated */}
      {pendingTools.length > 0 && (
        <Box style={{ marginBottom: tokens.spacing.sm, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {pendingTools.map((tc, i) => (
            <Box
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: tokens.typography.fontSize.xs,
                color: tokens.colors.text.muted,
              }}
            >
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: tokens.colors.primary,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <span style={{ display: 'flex', alignItems: 'center', color: tokens.colors.text.muted }}>
                {TOOL_ICONS[tc.name] || <SearchIcon style={iconStyle} />}
              </span>
              Looking up {TOOL_LABELS[tc.name] || tc.name}...
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            </Box>
          ))}
        </Box>
      )}

      {/* Completed tool calls — collapsible (inline mode only) */}
      {layout.toolResultPosition === 'inline' && completedTools.length > 0 && (
        <Box
          onClick={() => setShowTools(!showTools)}
          style={{
            marginBottom: tokens.spacing.sm,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: tokens.typography.fontSize.xs,
            color: tokens.colors.text.muted,
            userSelect: 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', transition: tokens.transitions.fast, transform: showTools ? 'rotate(0)' : 'rotate(-90deg)' }}>
            <ExpandMoreIcon style={{ width: '14px', height: '14px' }} />
          </span>
          Used {completedTools.length} tool{completedTools.length > 1 ? 's' : ''}
        </Box>
      )}
      {layout.toolResultPosition === 'inline' && showTools && completedTools.length > 0 && (
        <Box style={{
          marginBottom: tokens.spacing.sm,
          padding: '0.375rem 0.5rem',
          background: tokens.colors.surface,
          borderRadius: tokens.radius.md,
          border: `1px solid ${tokens.colors.border.subtle}`,
          fontSize: tokens.typography.fontSize.xs,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
        }}>
          {completedTools.map((tc, i) => (
            <Box key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: tokens.colors.text.muted }}>
              <span style={{ display: 'flex', alignItems: 'center', color: tokens.colors.text.muted }}>
                {TOOL_ICONS[tc.name] || <SearchIcon style={iconStyle} />}
              </span>
              {TOOL_LABELS[tc.name] || tc.name}
            </Box>
          ))}
        </Box>
      )}

      {/* Message content */}
      {text && (
        <Box style={bubbleStyle}>
          {isUser ? text : <ChatMarkdown content={text} />}
        </Box>
      )}

      {/* Rich tool results for grid-below mode */}
      {layout.toolResultPosition === 'grid-below' && toolsWithOutput.length > 0 && (
        <Box style={{ marginTop: tokens.spacing.sm, width: '100%', maxWidth: '85%' }}>
          {toolsWithOutput.map((tc, i) => (
            <Box key={i} style={{ marginBottom: tokens.spacing.sm }}>
              <ToolResultRenderer toolName={tc.name} output={tc.output} />
            </Box>
          ))}
        </Box>
      )}

      {/* Actions row — copy + feedback */}
      {!isUser && text && (
        <Box style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.125rem',
          marginTop: '0.375rem',
          opacity: 0.5,
          transition: `opacity ${tokens.transitions.fast}`,
        }}
          onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
          onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLDivElement).style.opacity = '0.5'; }}
        >
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: tokens.radius.sm,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: tokens.typography.fontSize.xs,
              color: copied ? tokens.colors.success : tokens.colors.text.muted,
            }}
            title="Copy response"
          >
            {copied
              ? <><CheckCircleIcon style={{ width: '14px', height: '14px' }} /> Copied</>
              : <><ContentCopyIcon style={{ width: '14px', height: '14px' }} /> Copy</>
            }
          </button>

          <span style={{ color: tokens.colors.border.subtle, margin: '0 0.125rem' }}>|</span>

          <button
            onClick={() => {
              const next = feedback === 'up' ? null : 'up' as const;
              setFeedback(next);
              if (next) sendFeedback(next);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: tokens.radius.sm,
              display: 'flex',
              alignItems: 'center',
              color: feedback === 'up' ? tokens.colors.primary : tokens.colors.text.muted,
            }}
            title="Good response"
          >
            {feedback === 'up'
              ? <ThumbUpAltIcon style={{ width: '14px', height: '14px' }} />
              : <ThumbUpOffAltIcon style={{ width: '14px', height: '14px' }} />
            }
          </button>

          <button
            onClick={() => {
              const next = feedback === 'down' ? null : 'down' as const;
              setFeedback(next);
              if (next) sendFeedback(next);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: tokens.radius.sm,
              display: 'flex',
              alignItems: 'center',
              color: feedback === 'down' ? tokens.colors.error : tokens.colors.text.muted,
            }}
            title="Bad response"
          >
            {feedback === 'down'
              ? <ThumbDownAltIcon style={{ width: '14px', height: '14px' }} />
              : <ThumbDownOffAltIcon style={{ width: '14px', height: '14px' }} />
            }
          </button>
        </Box>
      )}

      {/* Follow-up suggestions */}
      {followUps.length > 0 && onFollowUp && (
        <Box style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.375rem',
          marginTop: tokens.spacing.sm,
          maxWidth: '85%',
        }}>
          {followUps.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onFollowUp(suggestion)}
              style={{
                background: tokens.colors.surfaceRaised,
                border: `1px solid ${tokens.colors.border.default}`,
                borderRadius: tokens.radius.full,
                padding: '0.375rem 0.75rem',
                fontSize: tokens.typography.fontSize.xs,
                color: tokens.colors.text.secondary,
                cursor: 'pointer',
                transition: `border-color ${tokens.transitions.fast}, color ${tokens.transitions.fast}`,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.colors.primary;
                (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.primary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.colors.border.default;
                (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.text.secondary;
              }}
            >
              {suggestion}
            </button>
          ))}
        </Box>
      )}
    </Box>
  );
}
