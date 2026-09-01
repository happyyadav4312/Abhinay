import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { hashPassword, comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AuthUser } from '../types';

// ── Validation Schemas ──────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  role: z.nativeEnum(Role, {
    errorMap: () => ({ message: `Role must be one of: ${Object.values(Role).join(', ')}` }),
  }),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ── Service Functions ───────────────────────────────────

/**
 * Register a new user.
 */
export async function register(input: RegisterInput) {
  // Check for existing user
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new ServiceError('A user with this email already exists', 409);
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  // Generate tokens
  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  return { user, accessToken, refreshToken };
}

/**
 * Log in an existing user.
 */
export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new ServiceError('Invalid email or password', 401);
  }

  const isValid = await comparePassword(input.password, user.passwordHash);

  if (!isValid) {
    throw new ServiceError('Invalid email or password', 401);
  }

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh access token using a refresh token.
 */
export async function refresh(refreshTokenValue: string) {
  const decoded = verifyRefreshToken(refreshTokenValue);

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    throw new ServiceError('User not found', 401);
  }

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(authUser);
  const newRefreshToken = generateRefreshToken(authUser);

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Get the authenticated user's profile.
 */
export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new ServiceError('User not found', 404);
  }

  return user;
}

// ── Service Error ───────────────────────────────────────

export class ServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}
