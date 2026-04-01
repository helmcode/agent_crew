import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Webhook } from '../types';
import { webhooksApi } from '../services/api';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

function webhookStatusColor(webhook: Webhook): { bg: string; dot: string; pulse: boolean; label: string } {
  if (webhook.status === 'running') {
    return { bg: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400', pulse: true, label: 'running' };
  }
  if (!webhook.enabled) {
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

export function WebhooksListPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await webhooksApi.list();
      setWebhooks(data ?? []);
      setError(null);
    } catch (err) {
      setError(friendlyError(err, 'Failed to load webhooks. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
    const interval = setInterval(fetchWebhooks, 10_000);
    return () => clearInterval(interval);
  }, [fetchWebhooks]);

  async function handleToggle(e: React.MouseEvent, webhook: Webhook) {
    e.stopPropagation();
    setTogglingId(webhook.id);
    try {
      await webhooksApi.toggle(webhook.id);
      toast('success', webhook.enabled ? 'Webhook disabled' : 'Webhook enabled');
      fetchWebhooks();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to toggle webhook.'));
      fetchWebhooks();
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <LoadingSkeleton count={6} />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="mb-4 text-red-400">{error}</p>
        <button onClick={fetchWebhooks} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
          Retry
        </button>
      </div>
    );
  }

  if (webhooks.length === 0) {
    return (
      <EmptyState
        title="No webhooks yet"
        description="Create your first webhook to trigger team deployments via HTTP."
        action={{ label: 'New Webhook', onClick: () => navigate('/webhooks/new') }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Webhooks</h1>
        <button
          onClick={() => navigate('/webhooks/new')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Webhook
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {webhooks.map((webhook) => {
          const status = webhookStatusColor(webhook);
          return (
            <div
              key={webhook.id}
              onClick={() => navigate(`/webhooks/${webhook.id}`)}
              className="group cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 p-5 transition-all hover:border-slate-600 hover:bg-slate-800"
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-lg font-semibold text-white">{webhook.name}</h3>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${status.pulse ? 'animate-pulse' : ''}`} />
                  {status.label}
                </span>
              </div>

              {/* Secret prefix */}
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                <span className="font-mono text-xs">{webhook.secret_prefix}****</span>
              </div>

              {/* Team name */}
              {webhook.team?.name && (
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                  <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {webhook.team.name}
                </div>
              )}

              {/* Prompt template preview */}
              <p className="mb-4 line-clamp-2 text-sm text-slate-500">
                {webhook.prompt_template || 'No prompt template'}
              </p>

              {/* Timing info */}
              <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
                <span title={webhook.last_triggered_at ? new Date(webhook.last_triggered_at).toLocaleString() : 'Never'}>
                  Last triggered: {formatRelativeTime(webhook.last_triggered_at)}
                </span>
                <span>Timeout: {webhook.timeout_seconds}s</span>
              </div>

              {/* Toggle */}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={webhook.enabled}
                  aria-label={webhook.enabled ? 'Disable webhook' : 'Enable webhook'}
                  disabled={togglingId === webhook.id}
                  onClick={(e) => handleToggle(e, webhook)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                    webhook.enabled ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      webhook.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs text-slate-400">
                  {webhook.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
