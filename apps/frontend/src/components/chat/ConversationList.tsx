'use client';

import Link from 'next/link';
import { ChatConversation, User } from '@/types';
import { Avatar } from '@/components/common/Avatar';
import { ROLE_LABELS } from '@/types';
import { MessageSquare } from 'lucide-react';

interface ConversationListProps {
  conversations: ChatConversation[];
  currentUser: User | null;
  activeId?: string;
}

export function ConversationList({
  conversations,
  currentUser,
  activeId,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-stone-400">
        <MessageSquare className="h-10 w-10 stroke-1 text-stone-500 mb-3" />
        <p className="font-medium text-stone-200">No conversations yet</p>
        <p className="text-xs text-stone-400 mt-1 max-w-xs">
          Direct messaging opens when casting calls shortlist applicants.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-stone-800/60 overflow-y-auto">
      {conversations.map((conv) => {
        const isAuthor = currentUser?.id === conv.participantA.id;
        const otherParticipant = isAuthor ? conv.participantB : conv.participantA;
        const isActive = activeId === conv.id;

        const timeStr = conv.lastMessage
          ? new Date(conv.lastMessage.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';

        return (
          <Link
            key={conv.id}
            href={`/messages/${conv.id}`}
            className={`flex items-start gap-3 p-4 transition-colors ${
              isActive
                ? 'bg-amber-500/10 border-l-2 border-amber-500'
                : 'hover:bg-stone-800/50'
            }`}
          >
            <Avatar
              name={otherParticipant.name}
              photoUrl={otherParticipant.photoUrl}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium text-sm text-stone-100 truncate">
                  {otherParticipant.name}
                </span>
                {timeStr && (
                  <span className="text-[11px] text-stone-400 shrink-0">
                    {timeStr}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-amber-400/90 font-medium">
                  {ROLE_LABELS[otherParticipant.role]}
                </span>
                <span className="text-[11px] text-stone-500">•</span>
                <span className="text-[11px] text-stone-400 truncate">
                  {conv.castingRoleTitle}
                </span>
              </div>
              {conv.lastMessage && (
                <p className="text-xs text-stone-400 truncate mt-1">
                  {conv.lastMessage.content}
                </p>
              )}
            </div>
            {conv.unreadCount > 0 && (
              <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-amber-600 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                {conv.unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
