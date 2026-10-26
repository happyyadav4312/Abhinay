import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import { listNotificationsQuerySchema } from '../validators/notification.validator';
import * as notificationService from '../services/notification.service';

/** GET /notifications — list the user's notifications */
export async function listNotificationsController(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listNotificationsQuerySchema, req.query);
  const { user } = req as AuthenticatedRequest;
  const result = await notificationService.listNotifications(user.id, query);
  sendSuccess(res, result, 'Notifications retrieved');
}

/** PATCH /notifications/:id/read — mark a notification as read */
export async function markNotificationAsReadController(req: Request, res: Response): Promise<void> {
  const notificationId = requireUuidParam(req.params.id, 'Notification');
  const { user } = req as AuthenticatedRequest;
  const notification = await notificationService.markAsRead(user.id, notificationId);
  sendSuccess(res, { notification }, 'Notification marked as read');
}

/** POST /notifications/read-all — mark all notifications as read */
export async function markAllNotificationsAsReadController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthenticatedRequest;
  const result = await notificationService.markAllAsRead(user.id);
  sendSuccess(res, result, 'All notifications marked as read');
}
