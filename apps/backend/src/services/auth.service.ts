import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import {
  emailTaken,
  invalidCredentials,
  notFound,
  unauthenticated,
  ErrorCode,
} from '../utils/errors';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  SignedRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import { comparePassword, fakeComparePassword, hashPassword } from '../utils/password';
import { SafeUserDto, toSafeUser } from './dto';
import { LoginInput, RegisterInput } from '../validators/auth.validator';

export interface AuthResult {
  user: SafeUserDto;
  accessToken: string;
  refreshToken: SignedRefreshToken;
}

/** Persist the digest of a freshly minted refresh token. */
async function persistRefreshToken(
  tx: Prisma.TransactionClient,
  userId: string,
  refresh: SignedRefreshToken
): Promise<void> {
  await tx.refreshToken.create({
    data: {
      id: refresh.jti,
      userId,
      tokenHash: hashRefreshToken(refresh.token),
      expiresAt: refresh.expiresAt,
    },
  });
}

/**
 * Create the user and their profile in one transaction, so a failure can never
 * leave a user without a profile (or a profile without a user).
 *
 * The unique index on `users.email` is the actual arbiter of uniqueness: two
 * simultaneous registrations both pass the pre-check, and the loser surfaces as
 * Prisma P2002, which is translated to a clean 409 rather than a leaked
 * database error.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role as Role,
          profile: { create: {} },
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      const refreshToken = generateRefreshToken(user.id);
      await persistRefreshToken(tx, user.id, refreshToken);

      return {
        user: toSafeUser(user),
        accessToken: generateAccessToken(user),
        refreshToken,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.target as string[] | undefined)?.includes('email')
    ) {
      throw emailTaken();
    }
    throw error;
  }
}

/**
 * Verify credentials and start a refresh session.
 * Both "no such account" and "wrong password" return the same generic error.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    await fakeComparePassword(input.password);
    throw invalidCredentials();
  }

  if (!(await comparePassword(input.password, user.passwordHash))) {
    throw invalidCredentials();
  }

  const refreshToken = generateRefreshToken(user.id);
  await persistRefreshToken(prisma, user.id, refreshToken);

  return {
    user: toSafeUser(user),
    accessToken: generateAccessToken(user),
    refreshToken,
  };
}

/**
 * How long after a rotation the consumed token may still be presented, for the
 * case where the client never received the replacement. Short on purpose: it is
 * a window in which a stolen token is also still usable.
 */
const INTERRUPTED_ROTATION_GRACE_MS = 10_000;

/**
 * Recover from a rotation whose response never reached the client — a
 * navigation that cancelled the request, a dropped connection, a closed tab.
 * The server consumed the old token and minted a replacement the browser never
 * stored, so the session would otherwise be unrecoverable despite nothing
 * having gone wrong on the user's side.
 *
 * Returns the replacement to consume, or null when this is indistinguishable
 * from replay of a long-dead token: outside the grace window, or the
 * replacement has itself already been used, which means the real client did
 * receive it and this presentation is a reuse.
 */
async function recoverInterruptedRotation(record: {
  revokedAt: Date | null;
  replacedById: string | null;
}): Promise<{ id: string } | null> {
  if (!record.revokedAt || !record.replacedById) return null;
  if (Date.now() - record.revokedAt.getTime() > INTERRUPTED_ROTATION_GRACE_MS) return null;

  const replacement = await prisma.refreshToken.findUnique({
    where: { id: record.replacedById },
    select: { id: true, revokedAt: true, expiresAt: true },
  });

  if (!replacement || replacement.revokedAt !== null) return null;
  if (replacement.expiresAt.getTime() <= Date.now()) return null;

  return { id: replacement.id };
}

/**
 * Rotate a refresh token.
 *
 * The conditional `updateMany({ where: { id, revokedAt: null } })` is the whole
 * concurrency story: PostgreSQL serialises the two writes, so if the same token
 * is presented twice at once exactly one call sees `count === 1` and the other
 * sees `0` and gets a 401. Revocation and replacement happen in one transaction,
 * so there is no window where the old token is dead and the new one absent.
 */
export async function rotateRefreshToken(rawToken: string): Promise<AuthResult> {
  let payload: { sub: string; jti: string };
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw unauthenticated('Invalid or expired refresh token', ErrorCode.INVALID_TOKEN);
  }

  const tokenHash = hashRefreshToken(rawToken);

  const record = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
    include: { user: true },
  });

  // The record must exist, match this exact token, belong to the subject in the
  // JWT, and be unexpired. Any mismatch is a plain 401.
  if (
    !record ||
    record.tokenHash !== tokenHash ||
    record.userId !== payload.sub ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw unauthenticated('Invalid or expired refresh token', ErrorCode.INVALID_TOKEN);
  }

  // Normally the presented token is the one consumed. If it was already
  // rotated moments ago, the unused replacement is consumed instead.
  const consumable =
    record.revokedAt === null ? { id: record.id } : await recoverInterruptedRotation(record);

  if (!consumable) {
    throw unauthenticated('Invalid or expired refresh token', ErrorCode.INVALID_TOKEN);
  }

  const user = record.user;
  const replacement = generateRefreshToken(user.id);

  const rotated = await prisma.$transaction(async (tx) => {
    const consumed = await tx.refreshToken.updateMany({
      where: { id: consumable.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: replacement.jti },
    });

    if (consumed.count !== 1) {
      // Another concurrent request already consumed this token.
      return false;
    }

    await persistRefreshToken(tx, user.id, replacement);
    return true;
  });

  if (!rotated) {
    throw unauthenticated('Invalid or expired refresh token', ErrorCode.INVALID_TOKEN);
  }

  return {
    user: toSafeUser(user),
    accessToken: generateAccessToken(user),
    refreshToken: replacement,
  };
}

/**
 * Revoke the presented refresh session.
 *
 * Idempotent by construction: an absent, malformed, already-revoked or expired
 * token all resolve without error, and no access token is required. The caller
 * clears the cookie either way.
 *
 * This revokes the refresh session only. Access tokens already issued remain
 * valid until they expire (15 minutes by default) — see README "Logout
 * semantics".
 */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;

  let jti: string;
  try {
    jti = verifyRefreshToken(rawToken).jti;
  } catch {
    return;
  }

  const tokenHash = hashRefreshToken(rawToken);

  await prisma.refreshToken.updateMany({
    where: { id: jti, tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(userId: string): Promise<SafeUserDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  if (!user) {
    throw notFound('User not found');
  }

  return toSafeUser(user);
}
