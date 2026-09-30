/**
 * Turns a thrown error into the words `ErrorState` shows. Kept separate from
 * any API client so screens backed by mock data and screens backed by a real
 * backend word failures the same way.
 */
import { BRAND } from '@/constants/brand';

export type ErrorCopy = { title: string; message: string; icon: string; canRetry: boolean };

export function errorCopy(error: unknown, fallback?: string): ErrorCopy {
  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : '';

  if (status === 0 || /network|fetch/i.test(raw)) {
    return {
      title: "You're offline",
      message: `This device can't reach ${BRAND.name} right now. Check your connection, then try again.`,
      icon: 'cloud-offline-outline',
      canRetry: true,
    };
  }
  if (status === 401) {
    return {
      title: 'Your session ended',
      message: 'You have been signed out. Sign in again to carry on.',
      icon: 'log-out-outline',
      canRetry: false,
    };
  }
  if (status === 403) {
    return {
      title: 'Not yours to see',
      message: "This account doesn't have access to that.",
      icon: 'lock-closed-outline',
      canRetry: false,
    };
  }
  if (status === 404) {
    return {
      title: 'Nothing here',
      message: 'That item no longer exists.',
      icon: 'search-outline',
      canRetry: false,
    };
  }
  return {
    title: 'Something went wrong',
    message: fallback ?? 'Please try again in a moment.',
    icon: 'alert-circle-outline',
    canRetry: true,
  };
}
