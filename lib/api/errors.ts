/**
 * A failure with the HTTP status attached.
 *
 * `lib/errors.ts` reads `.status` to decide how to word a screen and whether to
 * offer a retry, so every layer below the screens throws this and nothing else.
 * Status 0 means the request never reached a server.
 */
export class ApiError extends Error {
  status: number;
  /** The backend's machine-readable code (`BAD_REQUEST`, `IDEMPOTENCY_IN_PROGRESS`, …). */
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;

/** The sentence a form shows under its submit button. */
export function messageOf(e: unknown, fallback = 'Something went wrong. Please try again.') {
  if (e instanceof ApiError) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
