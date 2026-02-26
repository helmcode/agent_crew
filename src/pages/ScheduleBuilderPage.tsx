import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Team, Schedule, CreateScheduleRequest } from '../types';
import { teamsApi, schedulesApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';
import { cronToHuman } from '../utils/cron';

type RepeatMode = 'hourly' | 'every_n_hours' | 'daily' | 'weekly' | 'monthly';

interface FrequencyConfig {
  mode: RepeatMode;
  minute: number;
  hour: number;
  everyNHours: number;
  daysOfWeek: number[];
  dayOfMonth: number;
}

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Mexico_City',
  'America/Bogota',
  'America/Santiago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function defaultFrequency(): FrequencyConfig {
  return {
    mode: 'daily',
    minute: 0,
    hour: 9,
    everyNHours: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    dayOfMonth: 1,
  };
}

export function buildCronExpression(config: FrequencyConfig): string {
  const { mode, minute, hour, everyNHours, daysOfWeek, dayOfMonth } = config;
  switch (mode) {
    case 'hourly':
      return `${minute} * * * *`;
    case 'every_n_hours':
      return `${minute} */${everyNHours} * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${daysOfWeek.sort((a, b) => a - b).join(',')}`;
    case 'monthly':
      return `${minute} ${hour} ${dayOfMonth} * *`;
    default:
      return `${minute} ${hour} * * *`;
  }
}

export function parseFrequencyConfig(cron: string): FrequencyConfig | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minStr, hourStr, domStr, , dowStr] = parts;
  const minute = parseInt(minStr, 10);

  // Hourly: N * * * *
  if (hourStr === '*' && domStr === '*' && dowStr === '*') {
    return { ...defaultFrequency(), mode: 'hourly', minute: isNaN(minute) ? 0 : minute };
  }

  // Every N hours: N */N * * *
  if (hourStr.startsWith('*/') && domStr === '*' && dowStr === '*') {
    const n = parseInt(hourStr.slice(2), 10);
    return { ...defaultFrequency(), mode: 'every_n_hours', minute: isNaN(minute) ? 0 : minute, everyNHours: isNaN(n) ? 2 : n };
  }

  const hour = parseInt(hourStr, 10);
  if (isNaN(hour) || isNaN(minute)) return null;

  // Weekly: N H * * D,D,...
  if (domStr === '*' && dowStr !== '*') {
    const days = dowStr.split(',').map(Number).filter((n) => !isNaN(n));
    if (days.length > 0) {
      return { ...defaultFrequency(), mode: 'weekly', minute, hour, daysOfWeek: days };
    }
  }

  // Monthly: N H D * *
  if (domStr !== '*' && dowStr === '*') {
    const dom = parseInt(domStr, 10);
    if (!isNaN(dom)) {
      return { ...defaultFrequency(), mode: 'monthly', minute, hour, dayOfMonth: dom };
    }
  }

  // Daily: N H * * *
  if (domStr === '*' && dowStr === '*') {
    return { ...defaultFrequency(), mode: 'daily', minute, hour };
  }

  return null;
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function formatCurrentTimeInZone(timezone: string): string | null {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return formatter.format(now);
  } catch {
    return null;
  }
}

export function ScheduleBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(!!editId);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone);
  const [enabled, setEnabled] = useState(true);
  const [freq, setFreq] = useState<FrequencyConfig>(defaultFrequency);

  const cronExpression = useMemo(() => buildCronExpression(freq), [freq]);
  const humanCron = useMemo(() => cronToHuman(cronExpression), [cronExpression]);
  const currentTimeInZone = useMemo(() => formatCurrentTimeInZone(timezone), [timezone]);

  // Fetch teams
  const fetchTeams = useCallback(async () => {
    try {
      const data = await teamsApi.list();
      setTeams(data ?? []);
    } catch {
      toast('error', 'Failed to load teams');
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  // Fetch existing schedule for edit mode
  const fetchSchedule = useCallback(async (id: string) => {
    try {
      const schedule: Schedule = await schedulesApi.get(id);
      setName(schedule.name);
      setTeamId(schedule.team_id);
      setPrompt(schedule.prompt);
      setTimezone(schedule.timezone);
      setEnabled(schedule.enabled);
      const parsed = parseFrequencyConfig(schedule.cron_expression);
      if (parsed) {
        setFreq(parsed);
      }
    } catch {
      toast('error', 'Failed to load schedule');
      navigate('/schedules');
    } finally {
      setLoadingSchedule(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchTeams();
    if (editId) fetchSchedule(editId);
  }, [fetchTeams, fetchSchedule, editId]);

  function updateFreq(patch: Partial<FrequencyConfig>) {
    setFreq((prev) => ({ ...prev, ...patch }));
  }

  function toggleDay(day: number) {
    setFreq((prev) => {
      const days = prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day];
      return { ...prev, daysOfWeek: days.length > 0 ? days : prev.daysOfWeek };
    });
  }

  function isValid(): boolean {
    return name.trim().length > 0 && teamId.length > 0 && prompt.trim().length > 0;
  }

  async function handleSubmit() {
    if (!isValid() || submitting) return;
    setSubmitting(true);

    try {
      const payload: CreateScheduleRequest = {
        name: name.trim(),
        team_id: teamId,
        prompt: prompt.trim(),
        cron_expression: cronExpression,
        timezone,
        enabled,
      };

      if (editId) {
        await schedulesApi.update(editId, {
          name: payload.name,
          prompt: payload.prompt,
          cron_expression: payload.cron_expression,
          timezone: payload.timezone,
          enabled: payload.enabled,
        });
        toast('success', 'Schedule updated');
        navigate(`/schedules/${editId}`);
      } else {
        const schedule = await schedulesApi.create(payload);
        toast('success', 'Schedule created');
        navigate(`/schedules/${schedule.id}`);
      }
    } catch (err) {
      toast('error', friendlyError(err, `Failed to ${editId ? 'update' : 'create'} schedule.`));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingSchedule || loadingTeams) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-slate-700" />
          <div className="h-12 w-full rounded bg-slate-800" />
          <div className="h-12 w-full rounded bg-slate-800" />
          <div className="h-32 w-full rounded bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-white">
        {editId ? 'Edit Schedule' : 'Create Schedule'}
      </h1>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Daily code review"
          />
        </div>

        {/* Team selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Team *</label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            disabled={!!editId}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            <option value="">Select a team...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {editId && (
            <p className="mt-1 text-xs text-slate-500">Team cannot be changed after creation.</p>
          )}
        </div>

        {/* Prompt */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Prompt *</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="The message to send to the team when the schedule triggers..."
          />
        </div>

        {/* Visual frequency builder */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h3 className="mb-4 text-sm font-medium text-slate-300">Schedule Frequency</h3>

          {/* Repeat mode */}
          <div className="mb-4">
            <label className="mb-1 block text-xs text-slate-400">Repeat</label>
            <select
              value={freq.mode}
              onChange={(e) => updateFreq({ mode: e.target.value as RepeatMode })}
              className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="hourly">Every hour</option>
              <option value="every_n_hours">Every N hours</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Every N hours input */}
          {freq.mode === 'every_n_hours' && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">Every</label>
              <div className="flex items-center gap-2">
                <select
                  value={freq.everyNHours}
                  onChange={(e) => updateFreq({ everyNHours: parseInt(e.target.value, 10) })}
                  className="rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {[2, 3, 4, 6, 8, 12].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-sm text-slate-400">hours</span>
              </div>
            </div>
          )}

          {/* Day of week picker (weekly) */}
          {freq.mode === 'weekly' && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-slate-400">Days</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      freq.daysOfWeek.includes(day.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day of month picker (monthly) */}
          {freq.mode === 'monthly' && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">Day of month</label>
              <select
                value={freq.dayOfMonth}
                onChange={(e) => updateFreq({ dayOfMonth: parseInt(e.target.value, 10) })}
                className="rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Time picker (for modes that use specific time) */}
          {(freq.mode === 'daily' || freq.mode === 'weekly' || freq.mode === 'monthly') && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">At time</label>
              <div className="flex items-center gap-2">
                <select
                  value={freq.hour}
                  onChange={(e) => updateFreq({ hour: parseInt(e.target.value, 10) })}
                  className="rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-slate-500">:</span>
                <select
                  value={freq.minute}
                  onChange={(e) => updateFreq({ minute: parseInt(e.target.value, 10) })}
                  className="rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Minute picker for hourly/every_n_hours */}
          {(freq.mode === 'hourly' || freq.mode === 'every_n_hours') && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">At minute</label>
              <select
                value={freq.minute}
                onChange={(e) => updateFreq({ minute: parseInt(e.target.value, 10) })}
                className="rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={m} value={m}>:{String(m).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
          )}

          {/* Live preview */}
          <div className="rounded-lg border border-slate-600/50 bg-slate-900/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-blue-400">{humanCron}</span>
            </div>
            <div className="mt-1 font-mono text-xs text-slate-500">
              cron: {cronExpression}
            </div>
            {currentTimeInZone && (
              <div className="mt-1 text-xs text-slate-500">
                Current time in {timezone}: {currentTimeInZone}
              </div>
            )}
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Auto-detected: {detectTimezone()}</p>
        </div>

        {/* Enabled toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              enabled ? 'bg-blue-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-slate-300">
            {enabled ? 'Schedule enabled — will run automatically' : 'Schedule disabled — will not run'}
          </span>
        </div>

        {/* Timeout warning */}
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-400">Execution timeout</p>
              <p className="mt-0.5 text-xs text-yellow-400/70">
                Scheduled runs have a default timeout. If the team takes longer than expected, the run will be marked as timed out. Make sure your prompt produces work that can complete within the timeout window.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => navigate(editId ? `/schedules/${editId}` : '/schedules')}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid() || submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? (editId ? 'Updating...' : 'Creating...')
              : (editId ? 'Update Schedule' : 'Create Schedule')
            }
          </button>
        </div>
      </div>
    </div>
  );
}
