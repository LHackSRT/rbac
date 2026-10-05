/**
 * Minimal API client: keeps the access token in memory, sends the refresh
 * cookie, and transparently refreshes the access token once on a 401.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Listener = () => void;

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
const sessionExpiredListeners = new Set<Listener>();
const forbiddenListeners = new Set<Listener>();

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function hasAccessToken() {
  return accessToken !== null;
}

/** Called when the session can no longer be refreshed. */
export function onSessionExpired(listener: Listener) {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/** Called on every 403: permissions may have changed server-side. */
export function onForbidden(listener: Listener) {
  forbiddenListeners.add(listener);
  return () => forbiddenListeners.delete(listener);
}

/** Exchanges the refresh cookie for a new access token. Concurrent calls share the same request. */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      accessToken = ((await response.json()) as { accessToken: string }).accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Return the raw Response (downloads). */
  raw?: boolean;
}

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `/api${path}${search ? `?${search}` : ''}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    return new ApiError(response.status, body.code ?? 'UNKNOWN', body.message ?? response.statusText, body.details);
  } catch {
    return new ApiError(response.status, 'UNKNOWN', response.statusText);
  }
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = () =>
    fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let response = await send();
  if (response.status === 401 && !path.startsWith('/auth/login')) {
    const error = await toApiError(response.clone());
    if (error.code === 'UNAUTHENTICATED' && (await refreshAccessToken())) {
      response = await send();
    }
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (response.status === 401 && !path.startsWith('/auth/login')) {
      accessToken = null;
      sessionExpiredListeners.forEach((listener) => listener());
    }
    if (response.status === 403) forbiddenListeners.forEach((listener) => listener());
    throw error;
  }
  if (options.raw) return response as T;
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>;
}
