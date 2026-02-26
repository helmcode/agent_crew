import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Schedule, ScheduleRun } from '../types';
import { schedulesApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';
import { cronToHuman } from '../utils/cron';

const runStatusStyles: Record<string, { bg: string; dot: string; pulse: boolean }> = {
  running: { bg: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400', pulse: true },
  success: { bg: 'bg-green-500/20 text-green-400', dot: 'bg-green-400', pulse: false },
  failed: { bg: 'bg-red-500/20 text-red-400', dot: 'bg-red-400', pulse: false },
  timeout: { bg: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400', pulse: false },
};

const BASE_POLL_INTERVAL = 10_000;
const MAX_POLL_INTERVAL = 120_000;

/** Strips potential stack traces, file paths, and sensitive data from error messages. */
function sanitizeRunError(error: string | null | undefined): string {
  if (!error) return '-';

  // Strip file paths (unix and windows)
  let sanitized = error.replace(/\/[\w./-]+/g, '[path]');
  sanitized = sanitized.replace(/[A-Z]:\\[\w.\\-]+/gi, '[path]');

  // Strip anything that looks like an API key or token (long hex/base64 strings)
  sanitized = sanitized.replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, '[redacted]');

  // Strip stack trace lines (e.g. "at Function.run (/app/...)")
  sanitized = sanitized.replace(/\s+at\s+.+/g, '');

  // Truncate to a safe display length
  const MAX_LEN = 200;
  if (sanitized.length > MAX_LEN) {
    sanitized = sanitized.slice(0, MAX_LEN) + '...';
  }

  return sanitized.trim() || 'Execution failed';
}

function formatDuration(start: string, end: string | null): string {
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

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString();
}

export function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const consecutiveFailures = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSchedule = useCallback(async () => {
    if (!id) return;
    try {
      const data = await schedulesApi.get(id);
      setSchedule(data);
      consecutiveFailures.current = 0;
    } catch (err) {
      if (loading) {
        toast('error', friendlyError(err, 'Failed to load schedule.'));
        navigate('/schedules');
      }
      consecutiveFailures.current += 1;
    } finally {
      setLoading(false);
    }
  }, [id, navigate, loading]);

  const fetchRuns = useCallback(async () => {
    if (!id) return;
    try {
      const response = await schedulesApi.runs(id);
      setRuns(response?.data ?? []);
    } catch {
      consecutiveFailures.current += 1;
    } finally {
      setLoadingRuns(false);
    }
  }, [id]);

  const schedulePoll = useCallback(() => {
    const backoff = Math.min(
      BASE_POLL_INTERVAL * Math.pow(2, consecutiveFailures.current),
      MAX_POLL_INTERVAL,
    );
    pollTimer.current = setTimeout(() => {
      Promise.all([fetchSchedule(), fetchRuns()]).finally(schedulePoll);
    }, backoff);
  }, [fetchSchedule, fetchRuns]);

  useEffect(() => {
    fetchSchedule();
    fetchRuns();
    schedulePoll();
    return () => clearTimeout(pollTimer.current);
  }, [fetchSchedule, fetchRuns, schedulePoll]);

  async function handleToggle() {
    if (!schedule) return;
    setTogglingEnabled(true);
    try {
      await schedulesApi.toggle(schedule.id);
      toast('success', schedule.enabled ? 'Schedule disabled' : 'Schedule enabled');
      fetchSchedule();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to toggle schedule.'));
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function handleDelete() {
    if (!schedule) return;
    setDeleting(true);
    try {
      await schedulesApi.delete(schedule.id);
      toast('success', 'Schedule deleted');
      navigate('/schedules');
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to delete schedule.'));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-slate-700" />
          <div className="h-40 rounded-lg bg-slate-800" />
          <div className="h-60 rounded-lg bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!schedule) return null;

  const statusColor = schedule.status === 'running'
    ? 'bg-blue-500/20 text-blue-400'
    : schedule.status === 'error'
      ? 'bg-red-500/20 text-red-400'
      : !schedule.enabled
        ? 'bg-slate-500/20 text-slate-400'
        : 'bg-green-500/20 text-green-400';

  const statusLabel = schedule.status === 'running'
    ? 'running'
    : schedule.status === 'error'
      ? 'error'
      : !schedule.enabled ? 'disabled' : 'idle';

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/schedules')}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Back to schedules"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">{schedule.name}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/schedules/new?edit=${schedule.id}`)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800"
          >
            Edit
          </button>
          <button
            onClick={() => setDeleteConfirm(true)}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Schedule info */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Schedule</dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-white">
              <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {cronToHuman(schedule.cron_expression)}
            </dd>
            <dd className="mt-0.5 font-mono text-xs text-slate-500">{schedule.cron_expression}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Timezone</dt>
            <dd className="mt-1 text-sm text-white">{schedule.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Team</dt>
            <dd className="mt-1 text-sm text-white">{schedule.team?.name ?? schedule.team_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Enabled</dt>
            <dd className="mt-1 flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={schedule.enabled}
                disabled={togglingEnabled}
                onClick={handleToggle}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                  schedule.enabled ? 'bg-blue-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    schedule.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm text-slate-400">{schedule.enabled ? 'On' : 'Off'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Last Run</dt>
            <dd className="mt-1 text-sm text-white">{formatDateTime(schedule.last_run_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Next Run</dt>
            <dd className="mt-1 text-sm text-white">{formatDateTime(schedule.next_run_at)}</dd>
          </div>
        </div>
      </div>

      {/* Prompt */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <h3 className="mb-2 text-sm font-medium text-slate-300">Prompt</h3>
        <pre className="whitespace-pre-wrap rounded bg-slate-900 p-3 font-mono text-sm text-slate-300">
          {schedule.prompt}
        </pre>
      </div>

      {/* Error display (if schedule is in error state) */}
      {schedule.status === 'error' && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-400">Schedule Error</p>
              <p className="mt-0.5 text-xs text-red-400/70">
                The last run encountered an error. Check the run history below for details.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Run History */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <h3 className="mb-4 text-sm font-medium text-slate-300">Run History</h3>
        {loadingRuns ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded bg-slate-900/50 p-3">
                <div className="flex gap-4">
                  <div className="h-4 w-16 rounded bg-slate-700" />
                  <div className="h-4 w-32 rounded bg-slate-700/60" />
                  <div className="h-4 w-20 rounded bg-slate-700/40" />
                </div>
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center">
            <p className="text-sm text-slate-500">No runs yet. The schedule will create runs when triggered.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2 pr-4">Error</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {runs.map((run) => {
                  const style = runStatusStyles[run.status] ?? runStatusStyles.failed;
                  return (
                    <tr key={run.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${style.pulse ? 'animate-pulse' : ''}`} />
                          {run.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-300">
                        {formatDateTime(run.started_at)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">
                        {formatDuration(run.started_at, run.finished_at)}
                      </td>
                      <td className="max-w-xs truncate py-2.5 pr-4 text-xs text-red-400" title={run.error ? 'Execution failed — see logs for details' : undefined}>
                        {sanitizeRunError(run.error)}
                      </td>
                      <td className="py-2.5">
                        {run.team_deployment_id && (
                          <button
                            onClick={() => navigate(`/teams/${run.team_deployment_id}`)}
                            className="rounded px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-500/10"
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-white">Delete Schedule</h2>
            <p className="mb-6 text-sm text-slate-400">
              Are you sure you want to delete <span className="font-medium text-white">{schedule.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
