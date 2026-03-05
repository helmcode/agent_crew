import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PostAction } from '../types';
import { postActionsApi } from '../services/api';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
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
  bearer: 'Bearer',
  basic: 'Basic',
  header: 'Custom Header',
};

export function PostActionsListPage() {
  const [actions, setActions] = useState<PostAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchActions = useCallback(async () => {
    try {
      const data = await postActionsApi.list();
      setActions(data ?? []);
      setError(null);
    } catch (err) {
      setError(friendlyError(err, 'Failed to load post-actions. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
    const interval = setInterval(fetchActions, 10_000);
    return () => clearInterval(interval);
  }, [fetchActions]);

  async function handleToggle(e: React.MouseEvent, action: PostAction) {
    e.stopPropagation();
    setTogglingId(action.id);
    try {
      await postActionsApi.update(action.id, { enabled: !action.enabled });
      toast('success', action.enabled ? 'Post-action disabled' : 'Post-action enabled');
      fetchActions();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to toggle post-action.'));
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <LoadingSkeleton count={6} />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="mb-4 text-red-400">{error}</p>
        <button onClick={fetchActions} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
          Retry
        </button>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <EmptyState
        title="No post-actions yet"
        description="Create your first post-action to call external APIs after webhook or schedule runs complete."
        action={{ label: 'New Post-Action', onClick: () => navigate('/post-actions/new') }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Post-Actions</h1>
        <button
          onClick={() => navigate('/post-actions/new')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Post-Action
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const methodColor = METHOD_COLORS[action.method.toUpperCase()] ?? 'bg-slate-500/20 text-slate-400';
          return (
            <div
              key={action.id}
              onClick={() => navigate(`/post-actions/${action.id}`)}
              className="group cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 p-5 transition-all hover:border-slate-600 hover:bg-slate-800"
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-lg font-semibold text-white">{action.name}</h3>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${methodColor}`}>
                  {action.method.toUpperCase()}
                </span>
              </div>

              {/* Description */}
              {action.description && (
                <p className="mb-3 line-clamp-2 text-sm text-slate-400">{action.description}</p>
              )}

              {/* URL */}
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-4.122a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                </svg>
                <span className="truncate font-mono text-xs" title={action.url}>{action.url}</span>
              </div>

              {/* Auth & Bindings info */}
              <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  {AUTH_LABELS[action.auth_type] ?? action.auth_type}
                </span>
                <span>{action.bindings_count ?? 0} binding{(action.bindings_count ?? 0) !== 1 ? 's' : ''}</span>
                {action.retry_count > 0 && <span>{action.retry_count} retries</span>}
              </div>

              {/* Toggle */}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={action.enabled}
                  aria-label={action.enabled ? 'Disable post-action' : 'Enable post-action'}
                  disabled={togglingId === action.id}
                  onClick={(e) => handleToggle(e, action)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                    action.enabled ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      action.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs text-slate-400">
                  {action.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
