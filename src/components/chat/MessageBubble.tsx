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
  ChevronRightIcon,
  AutoAwesomeIcon,
  InsertChartIcon,
  BaselineHelpIcon,
} from '@bigcommerce/big-design-icons';
import type { UIMessage } from 'ai';
import ChatMarkdown from './ChatMarkdown';

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

  if (lower.includes('order') && lower.includes('#')) {
    const orderMatch = text.match(/#(\d+)/);
    if (orderMatch) {
      suggestions.push(`What products are in order #${orderMatch[1]}?`);
      suggestions.push(`Where is order #${orderMatch[1]} being shipped?`);
    }
  } else if (lower.includes('product') && (lower.includes('$') || lower.includes('price'))) {
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
  } else if (lower.includes('store') && (lower.includes('summary') || lower.includes('overview'))) {
    suggestions.push('Show me recent orders');
    suggestions.push('Do I have any active promotions?');
    suggestions.push('How is my shipping configured?');
  }

  return suggestions.slice(0, 3);
}

export default function MessageBubble({ message, onFollowUp, isLatest }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showTools, setShowTools] = useState(false);

  const toolCalls: { name: string; state: string }[] = [];
  const textParts: string[] = [];

  for (const part of message.parts || []) {
    if (part.type === 'text' && part.text.trim()) {
      textParts.push(part.text);
    } else if (part.type.startsWith('tool-')) {
      const toolName = part.type.replace(/^tool-/, '');
      const toolPart = part as { type: string; state: string };
      toolCalls.push({ name: toolName, state: toolPart.state });
    }
  }

  const text = textParts.join('');
  if (!text && toolCalls.length === 0) return null;

  const completedTools = toolCalls.filter((t) => t.state === 'output-available');
  const pendingTools = toolCalls.filter((t) => t.state !== 'output-available');
  const followUps = isLatest && !isUser && text ? generateFollowUps(text) : [];

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
        marginBottom: '1rem',
      }}
    >
      {/* Pending tool calls — animated */}
      {pendingTools.length > 0 && (
        <Box style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {pendingTools.map((tc, i) => (
            <Box
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.75rem',
                color: '#6b6f82',
              }}
            >
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#3C64F4',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <span style={{ display: 'flex', alignItems: 'center', color: '#8b8fa3' }}>
                {TOOL_ICONS[tc.name] || <SearchIcon style={iconStyle} />}
              </span>
              Looking up {TOOL_LABELS[tc.name] || tc.name}...
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            </Box>
          ))}
        </Box>
      )}

      {/* Completed tool calls — collapsible */}
      {completedTools.length > 0 && (
        <Box
          onClick={() => setShowTools(!showTools)}
          style={{
            marginBottom: '0.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            color: '#8b8fa3',
            userSelect: 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', transition: 'transform 0.15s', transform: showTools ? 'rotate(0)' : 'rotate(-90deg)' }}>
            <ExpandMoreIcon style={{ width: '14px', height: '14px' }} />
          </span>
          Used {completedTools.length} tool{completedTools.length > 1 ? 's' : ''}
        </Box>
      )}
      {showTools && completedTools.length > 0 && (
        <Box style={{
          marginBottom: '0.5rem',
          padding: '0.375rem 0.5rem',
          background: '#f8f9fb',
          borderRadius: '6px',
          border: '1px solid #e8e9ef',
          fontSize: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
        }}>
          {completedTools.map((tc, i) => (
            <Box key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#6b6f82' }}>
              <span style={{ display: 'flex', alignItems: 'center', color: '#8b8fa3' }}>
                {TOOL_ICONS[tc.name] || <SearchIcon style={iconStyle} />}
              </span>
              {TOOL_LABELS[tc.name] || tc.name}
            </Box>
          ))}
        </Box>
      )}

      {/* Message content */}
      {text && (
        <Box
          style={{
            maxWidth: '85%',
            padding: '0.75rem 1rem',
            borderRadius: isUser ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
            background: isUser ? '#3C64F4' : '#f0f1f5',
            color: isUser ? '#fff' : '#313440',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            wordBreak: 'break-word',
            ...(isUser ? { whiteSpace: 'pre-wrap' as const } : {}),
          }}
        >
          {isUser ? text : <ChatMarkdown content={text} />}
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
          transition: 'opacity 0.15s',
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
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.6875rem',
              color: copied ? '#16a34a' : '#8b8fa3',
            }}
            title="Copy response"
          >
            {copied
              ? <><CheckCircleIcon style={{ width: '14px', height: '14px' }} /> Copied</>
              : <><ContentCopyIcon style={{ width: '14px', height: '14px' }} /> Copy</>
            }
          </button>

          <span style={{ color: '#e8e9ef', margin: '0 0.125rem' }}>|</span>

          <button
            onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              color: feedback === 'up' ? '#3C64F4' : '#8b8fa3',
            }}
            title="Good response"
          >
            {feedback === 'up'
              ? <ThumbUpAltIcon style={{ width: '14px', height: '14px' }} />
              : <ThumbUpOffAltIcon style={{ width: '14px', height: '14px' }} />
            }
          </button>

          <button
            onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              color: feedback === 'down' ? '#dc2626' : '#8b8fa3',
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
          marginTop: '0.5rem',
          maxWidth: '85%',
        }}>
          {followUps.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onFollowUp(suggestion)}
              style={{
                background: '#fff',
                border: '1px solid #d9dce9',
                borderRadius: '999px',
                padding: '0.375rem 0.75rem',
                fontSize: '0.75rem',
                color: '#525566',
                cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3C64F4';
                (e.currentTarget as HTMLButtonElement).style.color = '#3C64F4';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9dce9';
                (e.currentTarget as HTMLButtonElement).style.color = '#525566';
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
