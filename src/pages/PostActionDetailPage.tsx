import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  PostAction,
  PostActionBinding,
  PostActionRun,
  CreateBindingRequest,
  UpdateBindingRequest,
  TriggerType,
  TriggerOn,
  Webhook,
  Schedule,
} from '../types';
import { postActionsApi, webhooksApi, schedulesApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-yellow-500/20 text-yellow-400',
  PATCH: 'bg-orange-500/20 text-orange-400',
  DELETE: 'bg-red-500/20 text-red-400',
};

const AUTH_LABELS: Record<string, string> = {
  none: 'No Auth',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  header: 'Custom Header',
};

const runStatusStyles: Record<string, { bg: string; dot: string; pulse: boolean }> = {
  success: { bg: 'bg-green-500/20 text-green-400', dot: 'bg-green-400', pulse: false },
  failed: { bg: 'bg-red-500/20 text-red-400', dot: 'bg-red-400', pulse: false },
  retrying: { bg: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400', pulse: true },
};

const BASE_POLL_INTERVAL = 10_000;
const MAX_POLL_INTERVAL = 120_000;

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString();
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'Running...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return `${minutes}m ${remainSec}s`;
}

function sanitizeRunError(error: string | null | undefined): string {
  if (!error) return '-';
  let sanitized = error.replace(/\/[\w./-]+/g, '[path]');
  sanitized = sanitized.replace(/[A-Z]:\\[\w.\\-]+/gi, '[path]');
  sanitized = sanitized.replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, '[redacted]');
  return sanitized;
}

export function PostActionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [action, setAction] = useState<PostAction | null>(null);
  const [runs, setRuns] = useState<PostActionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const consecutiveFailures = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Binding modal state
  const [bindingModal, setBindingModal] = useState(false);
  const [editingBinding, setEditingBinding] = useState<PostActionBinding | null>(null);
  const [bindingTriggerType, setBindingTriggerType] = useState<TriggerType>('webhook');
  const [bindingTriggerId, setBindingTriggerId] = useState('');
  const [bindingTriggerOn, setBindingTriggerOn] = useState<TriggerOn>('any');
  const [bindingBodyOverride, setBindingBodyOverride] = useState('');
  const [bindingEnabled, setBindingEnabled] = useState(true);
  const [submittingBinding, setSubmittingBinding] = useState(false);
  const [deletingBindingId, setDeletingBindingId] = useState<string | null>(null);

  // Trigger sources for the binding modal
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState(false);

  const fetchAction = useCallback(async () => {
    if (!id) return;
    try {
      const data = await postActionsApi.get(id);
      setAction(data);
      consecutiveFailures.current = 0;
    } catch (err) {
      if (loading) {
        toast('error', friendlyError(err, 'Failed to load post-action.'));
        navigate('/post-actions');
      }
      consecutiveFailures.current += 1;
    } finally {
      setLoading(false);
    }
  }, [id, navigate, loading]);

  const fetchRuns = useCallback(async () => {
    if (!id) return;
    try {
      const response = await postActionsApi.runs(id);
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
      Promise.all([fetchAction(), fetchRuns()]).finally(schedulePoll);
    }, backoff);
  }, [fetchAction, fetchRuns]);

  useEffect(() => {
    fetchAction();
    fetchRuns();
    schedulePoll();
    return () => clearTimeout(pollTimer.current);
  }, [fetchAction, fetchRuns, schedulePoll]);

  async function fetchTriggerSources() {
    setLoadingTriggers(true);
    try {
      const [wh, sc] = await Promise.all([webhooksApi.list(), schedulesApi.list()]);
      setWebhooks(wh ?? []);
      setSchedules(sc ?? []);
    } catch {
      toast('error', 'Failed to load triggers');
    } finally {
      setLoadingTriggers(false);
    }
  }

  function openAddBinding() {
    setEditingBinding(null);
    setBindingTriggerType('webhook');
    setBindingTriggerId('');
    setBindingTriggerOn('any');
    setBindingBodyOverride('');
    setBindingEnabled(true);
    setBindingModal(true);
    fetchTriggerSources();
  }

  function openEditBinding(binding: PostActionBinding) {
    setEditingBinding(binding);
    setBindingTriggerType(binding.trigger_type);
    setBindingTriggerId(binding.trigger_id);
    setBindingTriggerOn(binding.trigger_on);
    setBindingBodyOverride(binding.body_override);
    setBindingEnabled(binding.enabled);
    setBindingModal(true);
    fetchTriggerSources();
  }

  async function handleSubmitBinding() {
    if (!id || submittingBinding) return;
    setSubmittingBinding(true);
    try {
      if (editingBinding) {
        const data: UpdateBindingRequest = {
          trigger_on: bindingTriggerOn,
          body_override: bindingBodyOverride,
          enabled: bindingEnabled,
        };
        await postActionsApi.updateBinding(id, editingBinding.id, data);
        toast('success', 'Binding updated');
      } else {
        if (!bindingTriggerId) {
          toast('error', 'Please select a trigger');
          setSubmittingBinding(false);
          return;
        }
        const data: CreateBindingRequest = {
          trigger_type: bindingTriggerType,
          trigger_id: bindingTriggerId,
          trigger_on: bindingTriggerOn,
          body_override: bindingBodyOverride,
          enabled: bindingEnabled,
        };
        await postActionsApi.createBinding(id, data);
        toast('success', 'Binding created');
      }
      setBindingModal(false);
      fetchAction();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to save binding.'));
    } finally {
      setSubmittingBinding(false);
    }
  }

  async function handleDeleteBinding(bindingId: string) {
    if (!id) return;
    setDeletingBindingId(bindingId);
    try {
      await postActionsApi.deleteBinding(id, bindingId);
      toast('success', 'Binding deleted');
      fetchAction();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to delete binding.'));
    } finally {
      setDeletingBindingId(null);
    }
  }

  async function handleDelete() {
    if (!action) return;
    setDeleting(true);
    try {
      await postActionsApi.delete(action.id);
      toast('success', 'Post-action deleted');
      navigate('/post-actions');
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to delete post-action.'));
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

  if (!action) return null;

  const methodColor = METHOD_COLORS[action.method.toUpperCase()] ?? 'bg-slate-500/20 text-slate-400';
  const triggerOptions = bindingTriggerType === 'webhook' ? webhooks : schedules;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/post-actions')}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Back to post-actions"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">{action.name}</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${methodColor}`}>
              {action.method.toUpperCase()}
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              action.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
            }`}>
              {action.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/post-actions/new?edit=${action.id}`)}
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

      {/* Config */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="mt-1 text-sm text-white">{action.name}</dd>
          </div>
          {action.description && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Description</dt>
              <dd className="mt-1 text-sm text-white">{action.description}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-slate-500">Method</dt>
            <dd className="mt-1">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${methodColor}`}>
                {action.method.toUpperCase()}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">URL</dt>
            <dd className="mt-1 truncate font-mono text-sm text-white" title={action.url}>{action.url}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Authentication</dt>
            <dd className="mt-1 text-sm text-white">{AUTH_LABELS[action.auth_type] ?? action.auth_type}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Timeout</dt>
            <dd className="mt-1 text-sm text-white">{action.timeout_seconds}s</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Retry Count</dt>
            <dd className="mt-1 text-sm text-white">{action.retry_count}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Created</dt>
            <dd className="mt-1 text-sm text-white">{formatDateTime(action.created_at)}</dd>
          </div>
        </div>

        {/* Headers */}
        {Object.keys(action.headers || {}).length > 0 && (
          <div className="mt-4 border-t border-slate-700 pt-4">
            <dt className="mb-2 text-xs text-slate-500">Custom Headers</dt>
            <div className="space-y-1">
              {Object.entries(action.headers).map(([key, value]) => (
                <div key={key} className="flex gap-2 font-mono text-xs">
                  <span className="text-slate-400">{key}:</span>
                  <span className="text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body Template */}
        {action.body_template && (
          <div className="mt-4 border-t border-slate-700 pt-4">
            <dt className="mb-2 text-xs text-slate-500">Body Template</dt>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-900 p-3 font-mono text-xs text-slate-300">
              {action.body_template}
            </pre>
          </div>
        )}
      </div>

      {/* Bindings */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Bindings</h3>
          <button
            onClick={openAddBinding}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Binding
          </button>
        </div>

        {(!action.bindings || action.bindings.length === 0) ? (
          <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center">
            <p className="text-sm text-slate-500">No bindings yet. Add a binding to connect this post-action to a webhook or schedule.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Trigger</th>
                  <th className="pb-2 pr-4">Condition</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {action.bindings.map((binding) => (
                  <tr key={binding.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center rounded-full bg-slate-700/50 px-2 py-0.5 text-xs font-medium text-slate-300">
                        {binding.trigger_type}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {binding.trigger_name || binding.trigger_id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        binding.trigger_on === 'success' ? 'bg-green-500/20 text-green-400'
                          : binding.trigger_on === 'failure' ? 'bg-red-500/20 text-red-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {binding.trigger_on}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs ${binding.enabled ? 'text-green-400' : 'text-slate-500'}`}>
                        {binding.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditBinding(binding)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white"
                          aria-label="Edit binding"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteBinding(binding.id)}
                          disabled={deletingBindingId === binding.id}
                          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-red-400 disabled:opacity-50"
                          aria-label="Delete binding"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
            <p className="text-sm text-slate-500">No runs yet. Runs appear here after bound triggers fire.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                  <th className="w-6 pb-2" />
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">HTTP</th>
                  <th className="pb-2 pr-4">Triggered</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {runs.map((run) => {
                  const style = runStatusStyles[run.status] ?? runStatusStyles.failed;
                  const isExpanded = expandedRunId === run.id;
                  const hasDetails = run.request_sent || run.response_body || run.error;
                  return (
                    <tr
                      key={run.id}
                      className={`hover:bg-slate-800/30 ${hasDetails ? 'cursor-pointer' : ''}`}
                      onClick={() => hasDetails && setExpandedRunId(isExpanded ? null : run.id)}
                    >
                      <td className="py-2.5 pr-1">
                        {hasDetails && (
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
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">
                        {run.status_code || '-'}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-300">
                        {formatDateTime(run.triggered_at)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">
                        {formatDuration(run.triggered_at, run.completed_at)}
                      </td>
                      <td className="max-w-xs truncate py-2.5 text-xs text-red-400">
                        {sanitizeRunError(run.error)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Expanded run details */}
            {expandedRunId && (() => {
              const run = runs.find((r) => r.id === expandedRunId);
              if (!run) return null;
              return (
                <div className="mt-2 space-y-2 rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
                  {run.request_sent && (
                    <div>
                      <p className="mb-1 text-[10px] font-medium text-slate-500">Request Sent</p>
                      <pre className="overflow-x-auto rounded bg-slate-800 p-2 font-mono text-xs text-slate-300">
                        {run.request_sent}
                      </pre>
                    </div>
                  )}
                  {run.response_body && (
                    <div>
                      <p className="mb-1 text-[10px] font-medium text-slate-500">Response Body</p>
                      <pre className="overflow-x-auto rounded bg-slate-800 p-2 font-mono text-xs text-slate-300">
                        {run.response_body}
                      </pre>
                    </div>
                  )}
                  {run.error && (
                    <div>
                      <p className="mb-1 text-[10px] font-medium text-red-400">Error</p>
                      <pre className="overflow-x-auto rounded bg-slate-800 p-2 font-mono text-xs text-red-300">
                        {sanitizeRunError(run.error)}
                      </pre>
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
            <h2 className="mb-2 text-lg font-semibold text-white">Delete Post-Action</h2>
            <p className="mb-6 text-sm text-slate-400">
              Are you sure you want to delete <span className="font-medium text-white">{action.name}</span>? All bindings and run history will be lost. This action cannot be undone.
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

      {/* Binding modal */}
      {bindingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold text-white">
              {editingBinding ? 'Edit Binding' : 'Add Binding'}
            </h2>

            <div className="space-y-4">
              {/* Trigger Type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Trigger Type</label>
                <div className="flex gap-2">
                  {(['webhook', 'schedule'] as TriggerType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={!!editingBinding}
                      onClick={() => {
                        setBindingTriggerType(t);
                        setBindingTriggerId('');
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                        bindingTriggerType === t
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trigger selector */}
              {!editingBinding && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    {bindingTriggerType === 'webhook' ? 'Webhook' : 'Schedule'} *
                  </label>
                  {loadingTriggers ? (
                    <div className="h-10 animate-pulse rounded bg-slate-800" />
                  ) : (
                    <select
                      value={bindingTriggerId}
                      onChange={(e) => setBindingTriggerId(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Select a {bindingTriggerType}...</option>
                      {triggerOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Trigger On */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Fire When</label>
                <div className="flex gap-2">
                  {(['any', 'success', 'failure'] as TriggerOn[]).map((cond) => (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => setBindingTriggerOn(cond)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        bindingTriggerOn === cond
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {cond.charAt(0).toUpperCase() + cond.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body Override */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Body Override</label>
                <textarea
                  value={bindingBodyOverride}
                  onChange={(e) => setBindingBodyOverride(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="Leave empty to use the post-action's default body template"
                />
              </div>

              {/* Enabled */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={bindingEnabled}
                  onClick={() => setBindingEnabled(!bindingEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    bindingEnabled ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      bindingEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-300">{bindingEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setBindingModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitBinding}
                disabled={submittingBinding || (!editingBinding && !bindingTriggerId)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingBinding
                  ? 'Saving...'
                  : editingBinding ? 'Update Binding' : 'Create Binding'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
