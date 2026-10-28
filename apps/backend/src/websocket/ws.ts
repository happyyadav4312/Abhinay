import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import * as chatService from '../services/chat.service';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  rooms?: Set<string>;
}

// Map of conversationId -> Set of active WebSockets in that room
const roomMembers = new Map<string, Set<AuthenticatedWebSocket>>();
// Map of userId -> Set of active WebSockets for that user (across tabs/devices)
const userSockets = new Map<string, Set<AuthenticatedWebSocket>>();

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade for /ws/chat path
  server.on('upgrade', async (req, socket, head) => {
    const { pathname, query } = parseUrl(req.url ?? '', true);

    if (pathname !== '/ws/chat') {
      socket.destroy();
      return;
    }

    const token = (query.token as string) ?? '';
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true },
      });

      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const authWs = ws as AuthenticatedWebSocket;
        authWs.userId = user.id;
        authWs.isAlive = true;
        authWs.rooms = new Set();
        wss.emit('connection', authWs, req);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    const userId = ws.userId!;

    // Track socket for this user
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(ws);

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        const payload = JSON.parse(data.toString()) as Record<string, unknown>;
        await handleClientMessage(ws, payload);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid message format';
        ws.send(
          JSON.stringify({
            type: 'error',
            message,
          })
        );
      }
    });

    ws.on('close', () => {
      // Remove from all rooms
      if (ws.rooms) {
        for (const roomId of ws.rooms) {
          const room = roomMembers.get(roomId);
          if (room) {
            room.delete(ws);
            if (room.size === 0) {
              roomMembers.delete(roomId);
            }
          }
        }
      }

      // Remove from user sockets
      const userSet = userSockets.get(userId);
      if (userSet) {
        userSet.delete(ws);
        if (userSet.size === 0) {
          userSockets.delete(userId);
        }
      }
    });
  });

  // Keep-alive ping interval every 30 seconds
  const interval = setInterval(() => {
    for (const ws of wss.clients as Set<AuthenticatedWebSocket>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

async function handleClientMessage(
  ws: AuthenticatedWebSocket,
  payload: Record<string, unknown>
) {
  const userId = ws.userId!;
  const type = typeof payload.type === 'string' ? payload.type : '';
  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : '';

  switch (type) {
    case 'join_room': {
      if (!conversationId) return;

      // Verify user is a participant
      const conv = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { participantA: true, participantB: true },
      });

      if (!conv || (conv.participantA !== userId && conv.participantB !== userId)) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Access denied: not a participant',
            conversationId,
          })
        );
        return;
      }

      if (!roomMembers.has(conversationId)) {
        roomMembers.set(conversationId, new Set());
      }
      roomMembers.get(conversationId)!.add(ws);
      ws.rooms!.add(conversationId);

      ws.send(
        JSON.stringify({
          type: 'joined_room',
          conversationId,
        })
      );
      break;
    }

    case 'leave_room': {
      if (!conversationId) return;
      const room = roomMembers.get(conversationId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) roomMembers.delete(conversationId);
      }
      ws.rooms?.delete(conversationId);
      ws.send(
        JSON.stringify({
          type: 'left_room',
          conversationId,
        })
      );
      break;
    }

    case 'chat_message': {
      const content = typeof payload.content === 'string' ? payload.content.trim() : '';
      if (!conversationId || !content) return;

      // Save via service
      const message = await chatService.sendMessage(
        conversationId,
        userId,
        content
      );

      // Broadcast to all participants in this room
      broadcastToRoom(conversationId, {
        type: 'chat_message',
        conversationId,
        message,
      });

      // Also notify participants who might be outside this room (e.g. on conversation list)
      const conv = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { participantA: true, participantB: true },
      });

      if (conv) {
        const otherUserId = conv.participantA === userId ? conv.participantB : conv.participantA;
        notifyUser(otherUserId, {
          type: 'new_message_notification',
          conversationId,
          message,
        });
      }
      break;
    }

    case 'typing': {
      if (!conversationId) return;
      // Broadcast typing indicator to others in the room
      broadcastToRoom(
        conversationId,
        {
          type: 'typing',
          conversationId,
          userId,
          isTyping: Boolean(payload.isTyping),
        },
        ws
      );
      break;
    }

    case 'read': {
      if (!conversationId) return;
      await chatService.markMessagesRead(conversationId, userId);
      broadcastToRoom(
        conversationId,
        {
          type: 'read',
          conversationId,
          userId,
        },
        ws
      );
      break;
    }

    default:
      ws.send(
        JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${type}`,
        })
      );
  }
}

function broadcastToRoom(
  conversationId: string,
  payload: unknown,
  excludeWs?: AuthenticatedWebSocket
) {
  const room = roomMembers.get(conversationId);
  if (!room) return;

  const data = JSON.stringify(payload);
  for (const client of room) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function notifyUser(userId: string, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  const data = JSON.stringify(payload);
  for (const client of sockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
