import { ApplicationStatus, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  ChatConversationDto,
  ChatMessageDto,
  photoUrlOf,
  toChatMessage,
} from './dto';
import { createNotification } from './notification.service';
import { forbidden, notEligible, notFound } from '../utils/errors';

const participantProfileSelect = {
  id: true,
  name: true,
  role: true,
  profile: {
    select: {
      profileImage: true,
      profileImageUrl: true,
    },
  },
} satisfies Prisma.UserSelect;

const conversationInclude = {
  castingRole: { select: { title: true } },
  userA: { select: participantProfileSelect },
  userB: { select: participantProfileSelect },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { sender: { select: { name: true } } },
  },
} satisfies Prisma.ChatConversationInclude;

type ConversationWithRelations = Prisma.ChatConversationGetPayload<{
  include: typeof conversationInclude;
}> & {
  _count?: {
    messages?: number;
  };
};

export async function createConversation(
  authorId: string,
  params: {
    applicationId?: string;
    castingRoleId?: string;
    applicantId?: string;
  }
): Promise<ChatConversationDto> {
  let resolvedRoleId = params.castingRoleId;
  let resolvedApplicantId = params.applicantId;

  if (params.applicationId) {
    const app = await prisma.application.findUnique({
      where: { id: params.applicationId },
      select: { castingRoleId: true, applicantId: true, status: true },
    });
    if (!app) throw notFound('Application not found');
    resolvedRoleId = app.castingRoleId;
    resolvedApplicantId = app.applicantId;

    if (
      app.status !== ApplicationStatus.SHORTLISTED &&
      app.status !== ApplicationStatus.SELECTED
    ) {
      throw notEligible('Chat can only be started with shortlisted or selected applicants');
    }
  }

  if (!resolvedRoleId || !resolvedApplicantId) {
    throw notFound('Role or applicant information missing');
  }

  // 1. Role must exist and be authored by authorId
  const role = await prisma.castingRole.findUnique({
    where: { id: resolvedRoleId },
    select: { id: true, title: true, createdById: true },
  });

  if (!role) {
    throw notFound('Casting role not found');
  }

  if (role.createdById !== authorId) {
    throw forbidden('Only the author of the casting call can initiate a chat');
  }

  if (!params.applicationId) {
    // 2. Applicant must have a shortlisted or selected application
    const application = await prisma.application.findUnique({
      where: {
        castingRoleId_applicantId: {
          castingRoleId: resolvedRoleId,
          applicantId: resolvedApplicantId,
        },
      },
      select: { id: true, status: true },
    });

    if (!application) {
      throw notFound('Application not found');
    }

    if (
      application.status !== ApplicationStatus.SHORTLISTED &&
      application.status !== ApplicationStatus.SELECTED
    ) {
      throw notEligible('Chat can only be started with shortlisted or selected applicants');
    }
  }

  // 3. Find or create conversation
  let conv = await prisma.chatConversation.findUnique({
    where: {
      castingRoleId_participantA_participantB: {
        castingRoleId: resolvedRoleId,
        participantA: authorId,
        participantB: resolvedApplicantId,
      },
    },
    include: conversationInclude,
  });

  if (!conv) {
    conv = await prisma.chatConversation.create({
      data: {
        castingRoleId: resolvedRoleId,
        participantA: authorId,
        participantB: resolvedApplicantId,
      },
      include: conversationInclude,
    });
  }

  return formatConversationDto(conv);
}

export async function listConversations(userId: string): Promise<ChatConversationDto[]> {
  const conversations = await prisma.chatConversation.findMany({
    where: {
      OR: [{ participantA: userId }, { participantB: userId }],
    },
    include: {
      castingRole: { select: { title: true } },
      userA: { select: participantProfileSelect },
      userB: { select: participantProfileSelect },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { name: true } } },
      },
      _count: {
        select: {
          messages: {
            where: {
              senderId: { not: userId },
              readAt: null,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return conversations.map((c) => ({
    id: c.id,
    castingRoleId: c.castingRoleId,
    castingRoleTitle: c.castingRole.title,
    participantA: {
      id: c.userA.id,
      name: c.userA.name,
      role: c.userA.role,
      photoUrl: photoUrlOf(c.userA.profile),
    },
    participantB: {
      id: c.userB.id,
      name: c.userB.name,
      role: c.userB.role,
      photoUrl: photoUrlOf(c.userB.profile),
    },
    lastMessage: c.messages[0] ? toChatMessage(c.messages[0]) : null,
    unreadCount: c._count.messages,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function getConversation(
  conversationId: string,
  userId: string
): Promise<ChatConversationDto> {
  const conv = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      castingRole: { select: { title: true } },
      userA: { select: participantProfileSelect },
      userB: { select: participantProfileSelect },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { name: true } } },
      },
      _count: {
        select: {
          messages: {
            where: {
              senderId: { not: userId },
              readAt: null,
            },
          },
        },
      },
    },
  });

  if (!conv) {
    throw notFound('Conversation not found');
  }

  if (conv.participantA !== userId && conv.participantB !== userId) {
    throw forbidden('You are not a participant in this conversation');
  }

  return {
    id: conv.id,
    castingRoleId: conv.castingRoleId,
    castingRoleTitle: conv.castingRole.title,
    participantA: {
      id: conv.userA.id,
      name: conv.userA.name,
      role: conv.userA.role,
      photoUrl: photoUrlOf(conv.userA.profile),
    },
    participantB: {
      id: conv.userB.id,
      name: conv.userB.name,
      role: conv.userB.role,
      photoUrl: photoUrlOf(conv.userB.profile),
    },
    lastMessage: conv.messages[0] ? toChatMessage(conv.messages[0]) : null,
    unreadCount: conv._count.messages,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  };
}

export async function getMessages(
  conversationId: string,
  userId: string,
  page = 1,
  pageSize = 50
): Promise<{
  items: ChatMessageDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const conv = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { participantA: true, participantB: true },
  });

  if (!conv) {
    throw notFound('Conversation not found');
  }

  if (conv.participantA !== userId && conv.participantB !== userId) {
    throw forbidden('You are not a participant in this conversation');
  }

  const [total, messages] = await Promise.all([
    prisma.chatMessage.count({ where: { conversationId } }),
    prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { sender: { select: { name: true } } },
    }),
  ]);

  return {
    items: messages.map(toChatMessage),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<ChatMessageDto> {
  const conv = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      participantA: true,
      participantB: true,
      castingRole: { select: { title: true } },
    },
  });

  if (!conv) {
    throw notFound('Conversation not found');
  }

  if (conv.participantA !== senderId && conv.participantB !== senderId) {
    throw forbidden('You are not a participant in this conversation');
  }

  const recipientId = conv.participantA === senderId ? conv.participantB : conv.participantA;

  const [message, sender] = await Promise.all([
    prisma.chatMessage.create({
      data: {
        conversationId,
        senderId,
        content,
      },
      include: {
        sender: { select: { name: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    }),
    // Touch conversation updatedAt
    prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  // Create an in-app notification for recipient
  await createNotification({
    recipientId,
    type: NotificationType.CHAT_MESSAGE_RECEIVED,
    title: `New message from ${sender?.name ?? 'Someone'}`,
    message: content.length > 80 ? `${content.slice(0, 77)}...` : content,
  }).catch(() => {
    // Non-blocking notification error
  });

  return toChatMessage(message);
}

export async function markMessagesRead(
  conversationId: string,
  userId: string
): Promise<{ markedCount: number }> {
  const conv = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { participantA: true, participantB: true },
  });

  if (!conv) {
    throw notFound('Conversation not found');
  }

  if (conv.participantA !== userId && conv.participantB !== userId) {
    throw forbidden('You are not a participant in this conversation');
  }

  const result = await prisma.chatMessage.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  return { markedCount: result.count };
}

function formatConversationDto(conv: ConversationWithRelations): ChatConversationDto {
  return {
    id: conv.id,
    castingRoleId: conv.castingRoleId,
    castingRoleTitle: conv.castingRole.title,
    participantA: {
      id: conv.userA.id,
      name: conv.userA.name,
      role: conv.userA.role,
      photoUrl: photoUrlOf(conv.userA.profile),
    },
    participantB: {
      id: conv.userB.id,
      name: conv.userB.name,
      role: conv.userB.role,
      photoUrl: photoUrlOf(conv.userB.profile),
    },
    lastMessage: conv.messages?.[0] ? toChatMessage(conv.messages[0]) : null,
    unreadCount: conv._count?.messages ?? 0,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  };
}
