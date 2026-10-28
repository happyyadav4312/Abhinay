'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, onTyping, disabled }: ChatInputProps) {
  const [content, setContent] = useState('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setContent('');
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    onTyping?.(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    if (onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex items-end gap-2 p-3 bg-stone-900 border-t border-stone-800">
      <textarea
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message (Enter to send, Shift+Enter for new line)..."
        disabled={disabled}
        rows={1}
        className="flex-1 max-h-32 min-h-[44px] resize-none rounded-xl bg-stone-950 border border-stone-800 px-4 py-2.5 text-sm text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
      />
      <Button
        type="button"
        onClick={handleSend}
        disabled={!content.trim() || disabled}
        className="h-11 w-11 shrink-0 rounded-xl bg-amber-600 hover:bg-amber-500 text-white p-0 flex items-center justify-center transition-colors"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
