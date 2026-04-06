'use client';

import { useState, useRef, useCallback } from 'react';
import { Button, Flex } from '@bigcommerce/big-design';
import { SendIcon } from '@bigcommerce/big-design-icons';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
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
    <Flex
      alignItems="flex-end"
      style={{
        gap: '0.5rem',
        padding: '1rem',
        borderTop: '1px solid #d9dce9',
        background: '#fff',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Ask about your store..."
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid #d9dce9',
          borderRadius: '4px',
          padding: '0.625rem 0.75rem',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          fontFamily: 'inherit',
          outline: 'none',
          maxHeight: '200px',
          overflow: 'auto',
        }}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        iconOnly={<SendIcon />}
        variant="primary"
      />
    </Flex>
  );
}
