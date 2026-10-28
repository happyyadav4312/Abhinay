import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import {
  createConversationBodySchema,
  listMessagesQuerySchema,
  sendMessageBodySchema,
} from '../validators/chat.validator';
import * as chatService from '../services/chat.service';

/** POST /chat/conversations — create or retrieve a conversation */
export async function createConversationController(req: Request, res: Response): Promise<void> {
  const body = parseOrThrow(createConversationBodySchema, req.body);
  const { user } = req as AuthenticatedRequest;
  const conversation = await chatService.createConversation(user.id, body);
  sendSuccess(res, { conversation }, 'Conversation ready', 201);
}

/** GET /chat/conversations — list all conversations for the user */
export async function listConversationsController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthenticatedRequest;
  const conversations = await chatService.listConversations(user.id);
  sendSuccess(res, { conversations }, 'Conversations retrieved');
}

/** GET /chat/conversations/:id — get single conversation */
export async function getConversationController(req: Request, res: Response): Promise<void> {
  const conversationId = requireUuidParam(req.params.id, 'Conversation');
  const { user } = req as AuthenticatedRequest;
  const conversation = await chatService.getConversation(conversationId, user.id);
  sendSuccess(res, { conversation }, 'Conversation retrieved');
}

/** GET /chat/conversations/:id/messages — list messages */
export async function getMessagesController(req: Request, res: Response): Promise<void> {
  const conversationId = requireUuidParam(req.params.id, 'Conversation');
  const query = parseOrThrow(listMessagesQuerySchema, req.query);
  const { user } = req as AuthenticatedRequest;
  const result = await chatService.getMessages(
    conversationId,
    user.id,
    query.page,
    query.pageSize
  );
  sendSuccess(res, result, 'Messages retrieved');
}

/** POST /chat/conversations/:id/messages — send a message */
export async function sendMessageController(req: Request, res: Response): Promise<void> {
  const conversationId = requireUuidParam(req.params.id, 'Conversation');
  const body = parseOrThrow(sendMessageBodySchema, req.body);
  const { user } = req as AuthenticatedRequest;
  const message = await chatService.sendMessage(conversationId, user.id, body.content);
  sendSuccess(res, { message }, 'Message sent', 201);
}

/** PATCH /chat/conversations/:id/messages/read — mark all messages as read */
export async function markMessagesReadController(req: Request, res: Response): Promise<void> {
  const conversationId = requireUuidParam(req.params.id, 'Conversation');
  const { user } = req as AuthenticatedRequest;
  const result = await chatService.markMessagesRead(conversationId, user.id);
  sendSuccess(res, result, 'Messages marked as read');
}
