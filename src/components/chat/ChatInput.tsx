'use client';

import { useState, useRef, useCallback } from 'react';
import { Box, Button, Flex, FlexItem } from '@bigcommerce/big-design';
import { SendIcon } from '@bigcommerce/big-design-icons';
import { useTheme } from './ThemeContext';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const { theme } = useTheme();
  const { tokens } = theme;
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  return (
    <Box
      padding="small"
      style={{ borderTop: `1px solid ${tokens.colors.border.default}`, background: tokens.colors.surfaceRaised }}
    >
      <Flex alignItems="flex-end" style={{ gap: '0.5rem' }}>
        <FlexItem flexGrow={1}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder || 'Ask about your store...'}
            disabled={disabled}
            rows={1}
            style={{
              width: '100%',
              resize: 'none',
              border: `1px solid ${tokens.colors.border.default}`,
              borderRadius: tokens.radius.md,
              padding: '0.625rem 0.75rem',
              fontSize: tokens.typography.fontSize.base,
              lineHeight: tokens.typography.lineHeight.normal,
              fontFamily: tokens.typography.fontFamily,
              outline: 'none',
              maxHeight: '200px',
              overflow: 'auto',
              boxSizing: 'border-box',
              transition: `border-color ${tokens.transitions.fast}`,
              background: tokens.colors.surfaceRaised,
              color: tokens.colors.text.primary,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = tokens.colors.border.default; }}
          />
        </FlexItem>
        <FlexItem>
          <Button
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            iconOnly={<SendIcon />}
            variant="primary"
          />
        </FlexItem>
      </Flex>
    </Box>
  );
}
