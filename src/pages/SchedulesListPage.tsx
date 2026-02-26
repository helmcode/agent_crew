import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Schedule } from '../types';
import { schedulesApi } from '../services/api';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';
import { cronToHuman } from '../utils/cron';

function scheduleStatusColor(schedule: Schedule): { bg: string; dot: string; pulse: boolean; label: string } {
  if (schedule.status === 'running') {
    return { bg: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400', pulse: true, label: 'running' };
  }
  if (schedule.status === 'error') {
    return { bg: 'bg-red-500/20 text-red-400', dot: 'bg-red-400', pulse: false, label: 'error' };
  }
  if (!schedule.enabled) {
    return { bg: 'bg-slate-500/20 text-slate-400', dot: 'bg-slate-400', pulse: false, label: 'disabled' };
  }
  return { bg: 'bg-green-500/20 text-green-400', dot: 'bg-green-400', pulse: false, label: 'idle' };
}

function formatRelativeTime(dateStr: string | null): string {
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

export function SchedulesListPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchSchedules = useCallback(async () => {
    try {
      const data = await schedulesApi.list();
      setSchedules(data ?? []);
      setError(null);
    } catch (err) {
      setError(friendlyError(err, 'Failed to load schedules. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
    const interval = setInterval(fetchSchedules, 10_000);
    return () => clearInterval(interval);
  }, [fetchSchedules]);

  async function handleToggle(e: React.MouseEvent, schedule: Schedule) {
    e.stopPropagation();
    setTogglingId(schedule.id);
    try {
      await schedulesApi.toggle(schedule.id);
      toast('success', schedule.enabled ? 'Schedule disabled' : 'Schedule enabled');
      fetchSchedules();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to toggle schedule.'));
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <LoadingSkeleton count={6} />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="mb-4 text-red-400">{error}</p>
        <button onClick={fetchSchedules} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
          Retry
        </button>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <EmptyState
        title="No schedules yet"
        description="Create your first schedule to automate team deployments."
        action={{ label: 'New Schedule', onClick: () => navigate('/schedules/new') }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Schedules</h1>
        <button
          onClick={() => navigate('/schedules/new')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Schedule
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {schedules.map((schedule) => {
          const status = scheduleStatusColor(schedule);
          return (
            <div
              key={schedule.id}
              onClick={() => navigate(`/schedules/${schedule.id}`)}
              className="group cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 p-5 transition-all hover:border-slate-600 hover:bg-slate-800"
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-lg font-semibold text-white">{schedule.name}</h3>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${status.pulse ? 'animate-pulse' : ''}`} />
                  {status.label}
                </span>
              </div>

              {/* Cron expression */}
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {cronToHuman(schedule.cron_expression)}
              </div>

              {/* Team name */}
              {schedule.team_name && (
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                  <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {schedule.team_name}
                </div>
              )}

              {/* Prompt preview */}
              <p className="mb-4 line-clamp-2 text-sm text-slate-500">
                {schedule.prompt || 'No prompt'}
              </p>

              {/* Timing info */}
              <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
                <span title={schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : 'Never'}>
                  Last: {formatRelativeTime(schedule.last_run_at)}
                </span>
                <span title={schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString() : 'N/A'}>
                  Next: {formatRelativeTime(schedule.next_run_at)}
                </span>
                <span className="font-mono">{schedule.timezone}</span>
              </div>

              {/* Toggle */}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={schedule.enabled}
                  aria-label={schedule.enabled ? 'Disable schedule' : 'Enable schedule'}
                  disabled={togglingId === schedule.id}
                  onClick={(e) => handleToggle(e, schedule)}
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
                <span className="text-xs text-slate-400">
                  {schedule.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
