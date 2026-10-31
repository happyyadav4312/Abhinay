'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/common/RequireAuth';
import { SiteHeader } from '@/components/common/SiteHeader';
import { ConversationList } from '@/components/chat/ConversationList';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { Avatar } from '@/components/common/Avatar';
import { ApiError, chatApi } from '@/lib/api';
import { ChatConversation, ChatMessage, ROLE_LABELS } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ChatRoomPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const conversationId = resolvedParams.id;
  const { user } = useAuth();
  const {
    isConnected,
    joinRoom,
    leaveRoom,
    sendChatMessage,
    sendTyping,
    markAsRead,
    onMessage,
    onTyping,
  } = useWebSocket();

  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Load conversation details and messages
  useEffect(() => {
    let active = true;

    Promise.all([
      chatApi.getConversation(conversationId),
      chatApi.getMessages(conversationId, { pageSize: 50 }),
      chatApi.listConversations(),
    ])
      .then(([convRes, msgsRes, listRes]) => {
        if (!active) return;
        setConversation(convRes.conversation);
        setMessages(msgsRes.items);
        setConversations(listRes.conversations);
        markAsRead(conversationId);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : 'Could not load this conversation.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setTimeout(() => scrollToBottom('auto'), 100);
        }
      });

    return () => {
      active = false;
    };
  }, [conversationId, markAsRead]);

  // Join WebSocket room
  useEffect(() => {
    if (isConnected) {
      joinRoom(conversationId);
    }
    return () => {
      leaveRoom(conversationId);
    };
  }, [conversationId, isConnected, joinRoom, leaveRoom]);

  // Listen for real-time messages
  useEffect(() => {
    const unsubscribe = onMessage((msg) => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setOtherUserTyping(false);
        markAsRead(conversationId);
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    });
    return unsubscribe;
  }, [conversationId, markAsRead, onMessage]);

  // Listen for typing events
  useEffect(() => {
    const unsubscribe = onTyping((event) => {
      if (event.conversationId === conversationId && event.userId !== user?.id) {
        setOtherUserTyping(event.isTyping);
      }
    });
    return unsubscribe;
  }, [conversationId, onTyping, user?.id]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (isConnected) {
        sendChatMessage(conversationId, content);
      } else {
        // Fallback to REST API
        try {
          const res = await chatApi.sendMessage(conversationId, content);
          setMessages((prev) => [...prev, res.message]);
          setTimeout(() => scrollToBottom('smooth'), 50);
        } catch {
          // Handled
        }
      }
    },
    [conversationId, isConnected, sendChatMessage]
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      sendTyping(conversationId, isTyping);
    },
    [conversationId, sendTyping]
  );

  const isAuthor = user?.id === conversation?.participantA.id;
  const otherParticipant = conversation
    ? isAuthor
      ? conversation.participantB
      : conversation.participantA
    : null;

  return (
    <RequireAuth>
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 flex flex-col">
          <div className="flex-1 min-h-[550px] border border-stone-800 rounded-2xl overflow-hidden bg-stone-900/60 grid grid-cols-1 md:grid-cols-3">
            {/* Conversations sidebar */}
            <div className="hidden md:flex flex-col border-r border-stone-800 overflow-hidden">
              <div className="p-3 border-b border-stone-800/80 bg-stone-900">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Conversations
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConversationList
                  conversations={conversations}
                  currentUser={user}
                  activeId={conversationId}
                />
              </div>
            </div>

            {/* Chat Room Area */}
            <div className="col-span-1 md:col-span-2 flex flex-col h-[75vh]">
              {/* Chat Header */}
              <div className="p-3.5 px-4 bg-stone-900 border-b border-stone-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Link
                    href="/messages"
                    className="md:hidden text-stone-400 hover:text-stone-200"
                    title="Back to conversations"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Link>

                  {otherParticipant && (
                    <>
                      <Avatar
                        name={otherParticipant.name}
                        photoUrl={otherParticipant.photoUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-stone-100 truncate">
                            {otherParticipant.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">
                            {ROLE_LABELS[otherParticipant.role]}
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 truncate">
                          {conversation?.castingRoleTitle}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {conversation && (
                  <Link
                    href={`/casting/${conversation.castingRoleId}`}
                    target="_blank"
                    className="text-xs text-stone-400 hover:text-amber-400 flex items-center gap-1 transition-colors shrink-0"
                  >
                    <span>View Role</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>

              {/* Messages viewport */}
              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <Spinner className="h-6 w-6 text-amber-500" />
                  </div>
                ) : error ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-stone-400">
                    <p className="text-sm font-medium text-rose-400">{error}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-stone-400">
                    <p className="text-sm font-medium text-stone-300">
                      No messages yet
                    </p>
                    <p className="text-xs text-stone-400 mt-1 max-w-xs">
                      Send a message below to start coordinating with{' '}
                      {otherParticipant?.name}.
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isOwn={message.senderId === user?.id}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Typing indicator */}
              {otherUserTyping && otherParticipant && (
                <div className="px-4 py-1.5 text-xs text-amber-400/90 italic bg-stone-900/40">
                  {otherParticipant.name} is typing...
                </div>
              )}

              {/* Chat Input */}
              <ChatInput
                onSendMessage={handleSendMessage}
                onTyping={handleTyping}
                disabled={loading}
              />
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
