import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { notFound } from '../utils/errors';

/**
 * In-app notifications (WBS 1.3.2.2). Notifications are created by domain
 * services (e.g. when an application status changes) and consumed by the
 * notification routes. They are never deleted — only marked as read.
 */

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedApplicationId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  notifications: NotificationDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  unreadCount: number;
}

type NotificationRow = Prisma.NotificationGetPayload<object>;

function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedApplicationId: row.relatedApplicationId,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Create a notification for a user. Called internally by domain services,
 * never by a controller directly.
 */
export async function createNotification(data: {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedApplicationId?: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId: data.recipientId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedApplicationId: data.relatedApplicationId ?? null,
    },
  });
}

/** The recipient's notifications, most recent first. */
export async function listNotifications(
  userId: string,
  query: { page: number; pageSize: number; unreadOnly?: boolean }
): Promise<NotificationPage> {
  const where: Prisma.NotificationWhereInput = { recipientId: userId };
  if (query.unreadOnly) where.readAt = null;

  const [total, rows, unreadCount] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
  ]);

  return {
    notifications: rows.map(toNotificationDto),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
    unreadCount,
  };
}

/** Mark a single notification as read. 404 if it doesn't belong to the user. */
export async function markAsRead(userId: string, notificationId: string): Promise<NotificationDto> {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (updated.count === 0) {
    // Maybe it's already read, or doesn't exist — check ownership.
    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, recipientId: userId },
    });
    if (!existing) throw notFound('Notification not found');
    // Already read — return it idempotently.
    return toNotificationDto(existing);
  }

  const notification = await prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
  });
  return toNotificationDto(notification);
}

/** Mark all the user's unread notifications as read. */
export async function markAllAsRead(userId: string): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { count: result.count };
}
