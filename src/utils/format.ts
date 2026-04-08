/**
 * Format a date string as a locale-aware date-time.
 */
export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString();
}

/**
 * Format the duration between two ISO timestamps.
 */
export function formatDuration(start: string, end: string | null): string {
  if (!end) return 'Running...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
}

/**
 * Format a date string as a human-readable relative time (e.g. "5m ago", "in 2h").
 */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);

  if (absDiffMs < 60_000) return diffMs > 0 ? 'in < 1m' : '< 1m ago';

  const minutes = Math.floor(absDiffMs / 60_000);
  if (minutes < 60) return diffMs > 0 ? `in ${minutes}m` : `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return diffMs > 0 ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return diffMs > 0 ? `in ${days}d` : `${days}d ago`;
}

/**
 * Strip potential stack traces, file paths, and sensitive tokens from run error messages.
 */
export function sanitizeRunError(error: string | null | undefined): string {
  if (!error) return '-';

  let sanitized = error.replace(/\/[\w./-]+/g, '[path]');
  sanitized = sanitized.replace(/[A-Z]:\\[\w.\\-]+/gi, '[path]');
  sanitized = sanitized.replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, '[redacted]');
  sanitized = sanitized.replace(/\s+at\s+.+/g, '');

  const MAX_LEN = 200;
  if (sanitized.length > MAX_LEN) {
    sanitized = sanitized.slice(0, MAX_LEN) + '...';
  }

  return sanitized.trim() || 'Execution failed';
}

/** Tailwind classes for run status badges used across detail pages. */
export const RUN_STATUS_STYLES: Record<string, { bg: string; dot: string; pulse: boolean }> = {
  running: { bg: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400', pulse: true },
  success: { bg: 'bg-green-500/20 text-green-400', dot: 'bg-green-400', pulse: false },
  failed: { bg: 'bg-red-500/20 text-red-400', dot: 'bg-red-400', pulse: false },
  timeout: { bg: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400', pulse: false },
  retrying: { bg: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400', pulse: true },
};

/** Tailwind badge colors per HTTP method. */
export const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-yellow-500/20 text-yellow-400',
  PATCH: 'bg-orange-500/20 text-orange-400',
  DELETE: 'bg-red-500/20 text-red-400',
};

/** Human-readable labels for post-action auth types. */
export const AUTH_LABELS: Record<string, string> = {
  none: 'No Auth',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  header: 'Custom Header',
};
