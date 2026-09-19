import type { Experience, OwnProfile, PublicProfile, Role, Skill, User } from '@/types';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1').replace(
  /\/+$/,
  ''
);

/** Required on cookie-authenticated endpoints; see docs/api.md. */
const CLIENT_HEADER = 'X-Abhinay-Client';
const CLIENT_HEADER_VALUE = 'web';

export type FieldErrors = Record<string, string[]>;

/** A failed request, carrying enough detail for forms to render per-field errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, code: string, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** True when the browser could not reach the API at all. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

// ── In-memory access token ──────────────────────────────
// Deliberately not localStorage/sessionStorage: a token kept only in the module
// closure is not readable by injected script through the storage APIs and is
// gone the moment the tab closes. The refresh cookie is what survives a reload.
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when a refresh attempt definitively fails, so the UI can reset. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

// ── Refresh coordination ────────────────────────────────
// One in-flight refresh at a time. Without this, several components mounting at
// once would each rotate the token and all but one would be handed a token that
// the next rotation immediately invalidates.
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Bumped on logout. A refresh that was already in flight when the user logged
 * out must not be allowed to install a fresh token afterwards and silently log
 * them back in.
 */
let sessionEpoch = 0;

export function invalidateSession(): void {
  sessionEpoch += 1;
  refreshInFlight = null;
  accessToken = null;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: { code: string; message: string; fieldErrors?: FieldErrors };
}

/** Parse a response body without assuming it is JSON, and without reading a 204. */
async function parseBody<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null;
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return null;
  }
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function toApiError(response: Response, body: ApiEnvelope<unknown> | null): ApiError {
  const error = body?.error;
  return new ApiError(
    response.status,
    error?.code ?? 'UNKNOWN',
    error?.message ?? body?.message ?? `Request failed with status ${response.status}`,
    error?.fieldErrors ?? {}
  );
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Multipart payload. Content-Type is left to the browser so the boundary is correct. */
  formData?: FormData;
  /** Set for endpoints authenticated purely by the refresh cookie. */
  clientHeader?: boolean;
  /**
   * Let the request outlive the page. Rotation is single-use: if a navigation
   * kills an in-flight refresh after the server has consumed the old token but
   * before the browser stores the new cookie, the session is unrecoverable and
   * the user is silently logged out.
   */
  keepalive?: boolean;
  /** Internal: prevents a retry loop. */
  isRetry?: boolean;
  signal?: AbortSignal;
}

async function rawRequest(endpoint: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};

  // Never set Content-Type on FormData — the browser must supply the boundary.
  if (options.formData === undefined && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (options.clientHeader) {
    headers[CLIENT_HEADER] = CLIENT_HEADER_VALUE;
  }

  return fetch(`${API_BASE_URL}${endpoint}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    keepalive: options.keepalive ?? false,
    signal: options.signal,
    body:
      options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
}

/**
 * Exchange the refresh cookie for a new access token.
 *
 * Callers share a single promise, and the result is discarded if the session was
 * invalidated (logged out) while the request was in flight.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const epochAtStart = sessionEpoch;

  refreshInFlight = (async (): Promise<string | null> => {
    try {
      const response = await rawRequest('/auth/refresh', {
        method: 'POST',
        clientHeader: true,
        keepalive: true,
      });

      if (!response.ok) return null;

      const body = await parseBody<{ accessToken: string; user: User }>(response);
      const token = body?.data?.accessToken ?? null;

      // A logout happened while this was in flight — drop the result.
      if (epochAtStart !== sessionEpoch) return null;

      if (token) accessToken = token;
      return token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Endpoints where a 401 is the answer, not a signal to refresh. */
function isAuthEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith('/auth/login') ||
    endpoint.startsWith('/auth/register') ||
    endpoint.startsWith('/auth/refresh') ||
    endpoint.startsWith('/auth/logout')
  );
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await rawRequest(endpoint, options);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  // One refresh, one retry. Never on 403 (a role denial is not fixed by a new
  // token) and never on the auth endpoints themselves.
  if (response.status === 401 && !options.isRetry && !isAuthEndpoint(endpoint)) {
    const token = await refreshAccessToken();

    if (token) {
      return request<T>(endpoint, { ...options, isRetry: true });
    }

    onUnauthenticated?.();
  }

  const body = await parseBody<T>(response);

  if (!response.ok) {
    throw toApiError(response, body);
  }

  return (body?.data ?? (undefined as T)) as T;
}

// ── Endpoint wrappers ───────────────────────────────────

export interface AuthPayload {
  user: User;
  accessToken: string;
}

export const authApi = {
  register: (input: { name: string; email: string; password: string; role: Role }) =>
    request<AuthPayload>('/auth/register', { method: 'POST', body: input }),

  login: (input: { email: string; password: string }) =>
    request<AuthPayload>('/auth/login', { method: 'POST', body: input }),

  // keepalive so a redirect fired right after logout cannot cancel the
  // server-side revocation and leave the refresh session alive.
  logout: () =>
    request<null>('/auth/logout', { method: 'POST', clientHeader: true, keepalive: true }),

  me: (signal?: AbortSignal) => request<{ user: User }>('/auth/me', { signal }),
};

export const profileApi = {
  me: (signal?: AbortSignal) => request<{ profile: OwnProfile }>('/profile/me', { signal }),

  update: (input: {
    name: string;
    bio: string | null;
    location: string | null;
    phone: string | null;
  }) => request<{ profile: OwnProfile }>('/profile/me', { method: 'PUT', body: input }),

  publicProfile: (id: string, signal?: AbortSignal) =>
    request<{ profile: PublicProfile }>(`/profile/${encodeURIComponent(id)}`, { signal }),

  addSkill: (name: string) =>
    request<{ skill: Skill }>('/profile/skills', { method: 'POST', body: { name } }),

  removeSkill: (profileSkillId: string) =>
    request<void>(`/profile/skills/${encodeURIComponent(profileSkillId)}`, { method: 'DELETE' }),

  createExperience: (input: Omit<Experience, 'id'>) =>
    request<{ experience: Experience }>('/profile/experience', { method: 'POST', body: input }),

  updateExperience: (id: string, input: Omit<Experience, 'id'>) =>
    request<{ experience: Experience }>(`/profile/experience/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    }),

  deleteExperience: (id: string) =>
    request<void>(`/profile/experience/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  uploadPhoto: (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    return request<{ profile: OwnProfile }>('/profile/photo', { method: 'POST', formData });
  },

  removePhoto: () => request<{ profile: OwnProfile }>('/profile/photo', { method: 'DELETE' }),
};

export const healthApi = {
  check: (signal?: AbortSignal) =>
    request<{ api: string; database: string; timestamp: string; environment: string }>('/health', {
      signal,
    }),
};
