import { Request } from 'express';
import { Role } from '@prisma/client';

// Authenticated user payload attached to the request by auth middleware
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

// Extended Express Request with authenticated user
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

// Standard API response envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}
