'use client';

import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/common/RequireAuth';
import { SiteHeader } from '@/components/common/SiteHeader';
import { ConversationList } from '@/components/chat/ConversationList';
import { chatApi } from '@/lib/api';
import { ChatConversation } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';
import { MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    chatApi
      .listConversations()
      .then((res) => {
        if (active) setConversations(res.conversations);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 flex flex-col">
          <div className="mb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-100">
              Messages
            </h1>
            <p className="text-sm text-stone-400 mt-0.5">
              Live communication with casting directors and shortlisted applicants.
            </p>
          </div>

          <div className="flex-1 min-h-[500px] border border-stone-800 rounded-2xl overflow-hidden bg-stone-900/60 grid grid-cols-1 md:grid-cols-3">
            {/* Conversations list sidebar */}
            <div className="border-r border-stone-800 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-stone-800/80 bg-stone-900">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Conversations
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-8 flex justify-center">
                    <Spinner className="h-6 w-6 text-amber-500" />
                  </div>
                ) : (
                  <ConversationList
                    conversations={conversations}
                    currentUser={user}
                  />
                )}
              </div>
            </div>

            {/* Empty selection state on desktop */}
            <div className="hidden md:flex flex-col items-center justify-center col-span-2 p-8 text-center text-stone-400">
              <div className="h-14 w-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mb-4">
                <MessageSquare className="h-7 w-7 text-amber-500/80" />
              </div>
              <h3 className="text-lg font-medium text-stone-200">
                Select a conversation
              </h3>
              <p className="text-sm text-stone-400 max-w-sm mt-1">
                Choose a conversation from the sidebar to view chat history and send
                real-time messages.
              </p>
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
