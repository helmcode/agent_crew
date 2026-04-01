import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Webhook, WebhookRun } from '../types';
import { webhooksApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';
import { copyToClipboard } from '../utils/clipboard';
import { MarkdownRenderer } from '../components/Markdown';
import { PostActionBindingsSection } from '../components/PostActionBindingsSection';

const runStatusStyles: Record<string, { bg: string; dot: string; pulse: boolean }> = {
  running: { bg: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400', pulse: true },
  success: { bg: 'bg-green-500/20 text-green-400', dot: 'bg-green-400', pulse: false },
  failed: { bg: 'bg-red-500/20 text-red-400', dot: 'bg-red-400', pulse: false },
  timeout: { bg: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400', pulse: false },
};

const BASE_POLL_INTERVAL = 10_000;
const MAX_POLL_INTERVAL = 120_000;

function sanitizeRunError(error: string | null | undefined): string {
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

export function WebhookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [runs, setRuns] = useState<WebhookRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const consecutiveFailures = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Regenerate token state
  const [regenerateConfirm, setRegenerateConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Endpoint cURL copy
  const [copiedCurl, setCopiedCurl] = useState(false);

  const fetchWebhook = useCallback(async () => {
    if (!id) return;
    try {
      const data = await webhooksApi.get(id);
      setWebhook(data);
      consecutiveFailures.current = 0;
    } catch (err) {
      if (loading) {
        toast('error', friendlyError(err, 'Failed to load webhook.'));
        navigate('/webhooks');
      }
      consecutiveFailures.current += 1;
    } finally {
      setLoading(false);
    }
  }, [id, navigate, loading]);

  const fetchRuns = useCallback(async () => {
    if (!id) return;
    try {
      const response = await webhooksApi.runs(id);
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
      Promise.all([fetchWebhook(), fetchRuns()]).finally(schedulePoll);
    }, backoff);
  }, [fetchWebhook, fetchRuns]);

  useEffect(() => {
    fetchWebhook();
    fetchRuns();
    schedulePoll();
    return () => clearTimeout(pollTimer.current);
  }, [fetchWebhook, fetchRuns, schedulePoll]);

  async function handleToggle() {
    if (!webhook) return;
    setTogglingEnabled(true);
    try {
      await webhooksApi.toggle(webhook.id);
      toast('success', webhook.enabled ? 'Webhook disabled' : 'Webhook enabled');
      fetchWebhook();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to toggle webhook.'));
      fetchWebhook();
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function handleDelete() {
    if (!webhook) return;
    setDeleting(true);
    try {
      await webhooksApi.delete(webhook.id);
      toast('success', 'Webhook deleted');
      navigate('/webhooks');
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to delete webhook.'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleRegenerateToken() {
    if (!webhook) return;
    setRegenerating(true);
    try {
      const result = await webhooksApi.regenerateToken(webhook.id);
      setNewToken(result.token);
      setRegenerateConfirm(false);
      fetchWebhook();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to regenerate token.'));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopyToken() {
    if (!newToken) return;
    try {
      await copyToClipboard(newToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      toast('error', 'Failed to copy to clipboard');
    }
  }

  function getCurlExample(): string {
    const origin = window.location.origin;
    return `curl -X POST ${origin}/webhook/trigger/YOUR_TOKEN \\
  -H "Content-Type: application/json" \\
  -d '{"variables": {"key": "value"}}'`;
  }

  async function handleCopyCurl() {
    try {
      await copyToClipboard(getCurlExample());
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      toast('error', 'Failed to copy to clipboard');
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

  if (!webhook) return null;

  const statusColor = webhook.status === 'running'
    ? 'bg-blue-500/20 text-blue-400'
    : !webhook.enabled
      ? 'bg-slate-500/20 text-slate-400'
      : 'bg-green-500/20 text-green-400';

  const statusLabel = webhook.status === 'running'
    ? 'running'
    : !webhook.enabled ? 'disabled' : 'idle';

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/webhooks')}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Back to webhooks"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">{webhook.name}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/webhooks/new?edit=${webhook.id}`)}
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

      {/* Webhook info */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="mt-1 text-sm text-white">{webhook.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Team</dt>
            <dd className="mt-1 text-sm text-white">{webhook.team?.name ?? webhook.team_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="mt-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
                {statusLabel}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Enabled</dt>
            <dd className="mt-1 flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={webhook.enabled}
                disabled={togglingEnabled}
                onClick={handleToggle}
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
              <span className="text-sm text-slate-400">{webhook.enabled ? 'On' : 'Off'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Timeout</dt>
            <dd className="mt-1 text-sm text-white">{webhook.timeout_seconds}s</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Max Concurrent</dt>
            <dd className="mt-1 text-sm text-white">{webhook.max_concurrent}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Last Triggered</dt>
            <dd className="mt-1 text-sm text-white">{formatDateTime(webhook.last_triggered_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Created</dt>
            <dd className="mt-1 text-sm text-white">{formatDateTime(webhook.created_at)}</dd>
          </div>
        </div>
      </div>

      {/* Endpoint */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Trigger Endpoint</h3>
          <button
            onClick={() => setRegenerateConfirm(true)}
            className="rounded-lg border border-yellow-500/30 px-3 py-1.5 text-xs text-yellow-400 transition-colors hover:bg-yellow-500/10"
          >
            Regenerate Token
          </button>
        </div>
        <div className="mb-2 text-xs text-slate-500">
          <span className="mr-2 rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-blue-400">POST</span>
          <code className="text-slate-300">{window.location.origin}/webhook/trigger/YOUR_TOKEN</code>
        </div>
        <div className="relative">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-900 p-3 font-mono text-xs text-slate-300">
            {getCurlExample()}
          </pre>
          <button
            onClick={handleCopyCurl}
            className="absolute right-2 top-2 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            {copiedCurl ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Replace <code className="text-slate-400">YOUR_TOKEN</code> with the token you received when creating the webhook.
        </p>
      </div>

      {/* Prompt template */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <h3 className="mb-2 text-sm font-medium text-slate-300">Prompt Template</h3>
        <pre className="whitespace-pre-wrap rounded bg-slate-900 p-3 font-mono text-sm text-slate-300">
          {webhook.prompt_template}
        </pre>
      </div>

      {/* Post-Actions */}
      <PostActionBindingsSection triggerType="webhook" triggerId={webhook.id} />

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
            <p className="text-sm text-slate-500">No runs yet. The webhook will create runs when triggered.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                  <th className="w-6 pb-2" />
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {runs.map((run) => {
                  const style = runStatusStyles[run.status] ?? runStatusStyles.failed;
                  const isExpanded = expandedRunId === run.id;
                  const hasConversation = run.prompt_sent || run.response_received;
                  return (
                    <tr
                      key={run.id}
                      className={`hover:bg-slate-800/30 ${hasConversation ? 'cursor-pointer' : ''}`}
                      onClick={() => hasConversation && setExpandedRunId(isExpanded ? null : run.id)}
                    >
                      <td className="py-2.5 pr-1">
                        {hasConversation && (
                          <svg
                            className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </td>
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
                      <td className="max-w-xs truncate py-2.5 text-xs text-red-400" title={run.error ? 'Execution failed — see logs for details' : undefined}>
                        {sanitizeRunError(run.error)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Inline conversation for expanded run */}
            {expandedRunId && (() => {
              const run = runs.find((r) => r.id === expandedRunId);
              if (!run || (!run.prompt_sent && !run.response_received)) return null;
              return (
                <div className="mt-2 space-y-2 rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
                  {run.caller_ip && (
                    <div className="mb-2 text-xs text-slate-500">
                      Caller IP: <code className="text-slate-400">{run.caller_ip}</code>
                    </div>
                  )}
                  {run.request_payload && (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-medium text-slate-500">Request Payload</p>
                      <pre className="overflow-x-auto rounded bg-slate-800 p-2 font-mono text-xs text-slate-300">
                        {run.request_payload}
                      </pre>
                    </div>
                  )}
                  {run.prompt_sent && (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-blue-600/20 px-3 py-2">
                        <p className="mb-1 text-[10px] font-medium text-blue-400">Prompt</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-200">{run.prompt_sent}</p>
                      </div>
                    </div>
                  )}
                  {run.response_received && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-slate-800 px-3 py-2">
                        <p className="mb-1 text-[10px] font-medium text-cyan-400">Response</p>
                        <div className="text-sm text-slate-200"><MarkdownRenderer>{run.response_received}</MarkdownRenderer></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-white">Delete Webhook</h2>
            <p className="mb-6 text-sm text-slate-400">
              Are you sure you want to delete <span className="font-medium text-white">{webhook.name}</span>? This action cannot be undone.
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

      {/* Regenerate token confirmation modal */}
      {regenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-white">Regenerate Token</h2>
            <p className="mb-6 text-sm text-slate-400">
              Are you sure? The current token will be <span className="font-medium text-yellow-400">permanently invalidated</span>. Any integrations using the old token will stop working.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRegenerateConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateToken}
                disabled={regenerating}
                className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-yellow-500 disabled:opacity-50"
              >
                {regenerating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New token display modal */}
      {newToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Token Regenerated</h2>
            </div>

            <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-yellow-400">Copy this token now. It will not be shown again.</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-400">New Webhook Token</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-green-400">
                  {newToken}
                </code>
                <button
                  onClick={handleCopyToken}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                >
                  {copiedToken ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setNewToken(null)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
