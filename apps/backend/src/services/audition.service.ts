import { ApplicationStatus, AuditionStatus, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { mediaStorage } from '../config/storage';
import {
  AuditionDto,
  photoUrlOf,
  toAuditionSubmission,
} from './dto';
import { createNotification } from './notification.service';
import { detectVideo, MEDIA_POLICY } from './media-validation.service';
import {
  badRequest,
  forbidden,
  mediaStorageUnavailable,
  notEligible,
  notFound,
  validationFailed,
} from '../utils/errors';
import { toCalendarDateString } from '../validators/common';

export interface TempUpload {
  path: string;
  originalName?: string;
}

const auditionInclude = {
  castingRole: {
    select: {
      id: true,
      title: true,
      createdById: true,
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  application: {
    select: {
      id: true,
      applicantId: true,
      applicant: {
        select: {
          id: true,
          name: true,
          role: true,
          profile: {
            select: {
              profileImage: true,
              profileImageUrl: true,
            },
          },
        },
      },
    },
  },
  submissions: {
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.AuditionInclude;

type AuditionWithRelations = Prisma.AuditionGetPayload<{ include: typeof auditionInclude }>;

function toAuditionDto(row: AuditionWithRelations): AuditionDto {
  return {
    id: row.id,
    castingRoleId: row.castingRoleId,
    castingRoleTitle: row.castingRole.title,
    applicationId: row.applicationId,
    instructions: row.instructions,
    deadline: row.deadline ? toCalendarDateString(row.deadline) : null,
    status: row.status,
    applicant: {
      id: row.application.applicant.id,
      name: row.application.applicant.name,
      role: row.application.applicant.role,
      photoUrl: photoUrlOf(row.application.applicant.profile),
    },
    roleAuthor: {
      id: row.castingRole.createdBy.id,
      name: row.castingRole.createdBy.name,
    },
    submissions: row.submissions.map(toAuditionSubmission),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function requestAudition(
  authorId: string,
  data: {
    castingRoleId: string;
    applicationId: string;
    instructions: string;
    deadline?: Date | null;
  }
): Promise<AuditionDto> {
  const role = await prisma.castingRole.findUnique({
    where: { id: data.castingRoleId },
    select: { id: true, title: true, createdById: true },
  });

  if (!role) {
    throw notFound('Casting role not found');
  }

  if (role.createdById !== authorId) {
    throw forbidden('Only the author of the casting call can request an audition');
  }

  const application = await prisma.application.findUnique({
    where: { id: data.applicationId },
    select: { id: true, castingRoleId: true, applicantId: true, status: true },
  });

  if (!application || application.castingRoleId !== data.castingRoleId) {
    throw notFound('Application not found for this casting call');
  }

  if (
    application.status !== ApplicationStatus.SHORTLISTED &&
    application.status !== ApplicationStatus.SELECTED
  ) {
    throw notEligible('Auditions can only be requested from shortlisted or selected applicants');
  }

  const existing = await prisma.audition.findUnique({
    where: { applicationId: data.applicationId },
  });

  if (existing) {
    throw badRequest('An audition has already been requested for this applicant');
  }

  const deadlineDate = data.deadline ?? null;

  const audition = await prisma.audition.create({
    data: {
      castingRoleId: data.castingRoleId,
      applicationId: data.applicationId,
      instructions: data.instructions,
      deadline: deadlineDate,
      status: AuditionStatus.PENDING,
    },
    include: auditionInclude,
  });

  await createNotification({
    recipientId: application.applicantId,
    type: NotificationType.AUDITION_REQUESTED,
    title: 'Audition Requested',
    message: `You have been requested to submit a self-tape audition for "${role.title}".`,
    relatedApplicationId: application.id,
  }).catch(() => undefined);

  return toAuditionDto(audition);
}

export async function submitAudition(
  applicantId: string,
  auditionId: string,
  upload: TempUpload,
  note?: string
): Promise<AuditionDto> {
  if (!mediaStorage.isAvailable()) {
    throw mediaStorageUnavailable();
  }

  const audition = await prisma.audition.findUnique({
    where: { id: auditionId },
    include: auditionInclude,
  });

  if (!audition) {
    throw notFound('Audition request not found');
  }

  if (audition.application.applicantId !== applicantId) {
    throw forbidden('You are not authorized to submit to this audition');
  }

  const extension = await detectVideo(upload.path);

  const stored = await mediaStorage.upload({
    localPath: upload.path,
    category: 'auditions',
    resourceType: 'video',
    extension,
  });

  const maxSeconds = MEDIA_POLICY.REEL.maxDurationSeconds;
  if (stored.durationSeconds !== null && stored.durationSeconds > maxSeconds) {
    await mediaStorage.remove({
      key: stored.key,
      category: 'auditions',
      resourceType: 'video',
    }).catch(() => undefined);

    throw validationFailed(
      { video: [`An audition video may be at most ${maxSeconds / 60} minutes long`] },
      `An audition video may be at most ${maxSeconds / 60} minutes long`
    );
  }

  await prisma.$transaction([
    prisma.auditionSubmission.create({
      data: {
        auditionId,
        provider: stored.provider,
        storageKey: stored.key,
        url: stored.url,
        thumbnailUrl: stored.thumbnailUrl,
        bytes: stored.bytes,
        durationSeconds: stored.durationSeconds,
        note: note ?? null,
      },
    }),
    prisma.audition.update({
      where: { id: auditionId },
      data: {
        status: AuditionStatus.SUBMITTED,
        updatedAt: new Date(),
      },
    }),
  ]);

  await createNotification({
    recipientId: audition.castingRole.createdById,
    type: NotificationType.AUDITION_SUBMITTED,
    title: 'Audition Video Submitted',
    message: `${audition.application.applicant.name} submitted a self-tape for "${audition.castingRole.title}".`,
    relatedApplicationId: audition.applicationId,
  }).catch(() => undefined);

  const updated = await prisma.audition.findUnique({
    where: { id: auditionId },
    include: auditionInclude,
  });

  if (!updated) {
    throw notFound('Audition request not found');
  }

  return toAuditionDto(updated);
}

export async function updateAuditionStatus(
  authorId: string,
  auditionId: string,
  status: AuditionStatus
): Promise<AuditionDto> {
  const audition = await prisma.audition.findUnique({
    where: { id: auditionId },
    include: auditionInclude,
  });

  if (!audition) {
    throw notFound('Audition request not found');
  }

  if (audition.castingRole.createdById !== authorId) {
    throw forbidden('Only the author of the casting call can update the audition status');
  }

  const updated = await prisma.audition.update({
    where: { id: auditionId },
    data: { status },
    include: auditionInclude,
  });

  const readableStatus = status.toLowerCase().replace('_', ' ');
  await createNotification({
    recipientId: audition.application.applicantId,
    type: NotificationType.AUDITION_REVIEWED,
    title: 'Audition Status Updated',
    message: `Your audition for "${audition.castingRole.title}" is now ${readableStatus}.`,
    relatedApplicationId: audition.applicationId,
  }).catch(() => undefined);

  return toAuditionDto(updated);
}

export async function getAudition(auditionId: string, userId: string): Promise<AuditionDto> {
  const audition = await prisma.audition.findUnique({
    where: { id: auditionId },
    include: auditionInclude,
  });

  if (!audition) {
    throw notFound('Audition request not found');
  }

  if (
    audition.castingRole.createdById !== userId &&
    audition.application.applicantId !== userId
  ) {
    throw forbidden('You are not authorized to view this audition');
  }

  return toAuditionDto(audition);
}

export async function listAuditionsForRole(
  authorId: string,
  castingRoleId: string,
  query: { status?: AuditionStatus; page: number; pageSize: number }
): Promise<{
  items: AuditionDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const role = await prisma.castingRole.findUnique({
    where: { id: castingRoleId },
    select: { createdById: true },
  });

  if (!role) {
    throw notFound('Casting role not found');
  }

  if (role.createdById !== authorId) {
    throw forbidden('Only the author of the casting call can view its auditions');
  }

  const where: Prisma.AuditionWhereInput = { castingRoleId };
  if (query.status) {
    where.status = query.status;
  }

  const [total, auditions] = await Promise.all([
    prisma.audition.count({ where }),
    prisma.audition.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: auditionInclude,
    }),
  ]);

  return {
    items: auditions.map(toAuditionDto),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize) || 1,
    },
  };
}

export async function listMyAuditions(
  applicantId: string,
  query: { status?: AuditionStatus; page: number; pageSize: number }
): Promise<{
  items: AuditionDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.AuditionWhereInput = {
    application: {
      applicantId,
    },
  };
  if (query.status) {
    where.status = query.status;
  }

  const [total, auditions] = await Promise.all([
    prisma.audition.count({ where }),
    prisma.audition.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: auditionInclude,
    }),
  ]);

  return {
    items: auditions.map(toAuditionDto),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize) || 1,
    },
  };
}
