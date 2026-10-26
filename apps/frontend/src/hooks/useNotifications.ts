'use client';

import { useCallback, useEffect, useState } from 'react';
import { notificationsApi } from '@/lib/api';
import type { Notification } from '@/types';
import { useAuth } from './useAuth';

export function useNotifications() {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await notificationsApi.list({ pageSize: 1 });
      setUnreadCount(data.unreadCount);
    } catch {
      // Ignore background refresh errors
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;
    notificationsApi
      .list({ pageSize: 1 })
      .then((data) => {
        if (isMounted) setUnreadCount(data.unreadCount);
      })
      .catch(() => {});

    const timer = setInterval(() => {
      notificationsApi
        .list({ pageSize: 1 })
        .then((data) => {
          if (isMounted) setUnreadCount(data.unreadCount);
        })
        .catch(() => {});
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
    }
  }, []);

  return {
    unreadCount: isAuthenticated ? unreadCount : 0,
    notifications,
    setNotifications,
    isLoading,
    setIsLoading,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}
