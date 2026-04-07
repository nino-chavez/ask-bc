'use client';

import { useState, useRef, useCallback } from 'react';
import { Box, Button, Flex, FlexItem } from '@bigcommerce/big-design';
import { SendIcon } from '@bigcommerce/big-design-icons';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
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
      style={{ borderTop: '1px solid #d9dce9', background: '#fff' }}
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
              border: '1px solid #d9dce9',
              borderRadius: '6px',
              padding: '0.625rem 0.75rem',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              fontFamily: 'inherit',
              outline: 'none',
              maxHeight: '200px',
              overflow: 'auto',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#3C64F4'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#d9dce9'; }}
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
