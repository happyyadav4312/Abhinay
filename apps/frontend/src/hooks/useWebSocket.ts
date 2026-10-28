'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/api';
import { ChatMessage } from '@/types';

interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

interface NewMessageNotificationEvent {
  conversationId: string;
  message: ChatMessage;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageListenersRef = useRef<Set<(msg: ChatMessage) => void>>(new Set());
  const typingListenersRef = useRef<Set<(event: TypingEvent) => void>>(new Set());
  const notificationListenersRef = useRef<
    Set<(event: NewMessageNotificationEvent) => void>
  >(new Set());
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
    const wsBaseUrl = apiUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '');
    const wsUrl = `${wsBaseUrl}/ws/chat?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_message' && data.message) {
          messageListenersRef.current.forEach((listener) => listener(data.message));
        } else if (data.type === 'typing') {
          typingListenersRef.current.forEach((listener) =>
            listener({
              conversationId: data.conversationId,
              userId: data.userId,
              isTyping: data.isTyping,
            })
          );
        } else if (data.type === 'new_message_notification') {
          notificationListenersRef.current.forEach((listener) =>
            listener({
              conversationId: data.conversationId,
              message: data.message,
            })
          );
        }
      } catch {
        // Ignored unparseable message
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      socketRef.current = null;
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const joinRoom = useCallback((conversationId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'join_room',
          conversationId,
        })
      );
    }
  }, []);

  const leaveRoom = useCallback((conversationId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'leave_room',
          conversationId,
        })
      );
    }
  }, []);

  const sendChatMessage = useCallback((conversationId: string, content: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'chat_message',
          conversationId,
          content,
        })
      );
    }
  }, []);

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'typing',
          conversationId,
          isTyping,
        })
      );
    }
  }, []);

  const markAsRead = useCallback((conversationId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'read',
          conversationId,
        })
      );
    }
  }, []);

  const onMessage = useCallback((callback: (msg: ChatMessage) => void) => {
    messageListenersRef.current.add(callback);
    return () => {
      messageListenersRef.current.delete(callback);
    };
  }, []);

  const onTyping = useCallback((callback: (event: TypingEvent) => void) => {
    typingListenersRef.current.add(callback);
    return () => {
      typingListenersRef.current.delete(callback);
    };
  }, []);

  const onNotification = useCallback(
    (callback: (event: NewMessageNotificationEvent) => void) => {
      notificationListenersRef.current.add(callback);
      return () => {
        notificationListenersRef.current.delete(callback);
      };
    },
    []
  );

  return {
    isConnected,
    joinRoom,
    leaveRoom,
    sendChatMessage,
    sendTyping,
    markAsRead,
    onMessage,
    onTyping,
    onNotification,
  };
}
