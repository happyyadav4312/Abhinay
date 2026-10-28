'use client';

import { ChatMessage } from '@/types';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-3`}>
      {!isOwn && (
        <span className="text-xs font-medium text-stone-400 mb-1 ml-1">
          {message.senderName}
        </span>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap break-words ${
          isOwn
            ? 'bg-amber-600 text-white rounded-br-xs'
            : 'bg-stone-800 text-stone-100 border border-stone-700/60 rounded-bl-xs'
        }`}
      >
        {message.content}
      </div>
      <div className="flex items-center gap-1 mt-1 text-[10px] text-stone-400 px-1">
        <span>{time}</span>
        {isOwn && (
          <span className="text-[10px] text-stone-400">
            {message.readAt ? '✓✓' : '✓'}
          </span>
        )}
      </div>
    </div>
  );
}
