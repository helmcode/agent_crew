import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  PostAction,
  PostActionBinding,
  CreateBindingRequest,
  UpdateBindingRequest,
  TriggerOn,
} from '../types';
import { postActionsApi, webhooksApi, schedulesApi } from '../services/api';
import { toast } from './Toast';
import { friendlyError } from '../utils/errors';

interface PostActionBindingsSectionProps {
  triggerType: 'webhook' | 'schedule';
  triggerId: string;
  onBindingChange?: () => void;
}

const CONDITION_STYLES: Record<string, string> = {
  success: 'bg-green-500/20 text-green-400',
  failure: 'bg-red-500/20 text-red-400',
  any: 'bg-blue-500/20 text-blue-400',
};

export function PostActionBindingsSection({ triggerType, triggerId, onBindingChange }: PostActionBindingsSectionProps) {
  const navigate = useNavigate();
  const [bindings, setBindings] = useState<PostActionBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Link modal state
  const [linkModal, setLinkModal] = useState(false);
  const [editingBinding, setEditingBinding] = useState<PostActionBinding | null>(null);
  const [availableActions, setAvailableActions] = useState<PostAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [triggerOn, setTriggerOn] = useState<TriggerOn>('any');
  const [bodyOverride, setBodyOverride] = useState('');
  const [bindingEnabled, setBindingEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const fetchBindings = useCallback(async () => {
    try {
      const fetcher = triggerType === 'webhook'
        ? webhooksApi.postActions(triggerId)
        : schedulesApi.postActions(triggerId);
      const data = await fetcher;
      setBindings(data ?? []);
    } catch {
      // Silently fail — section is supplementary
    } finally {
      setLoading(false);
    }
  }, [triggerType, triggerId]);

  useEffect(() => {
    fetchBindings();
  }, [fetchBindings]);

  async function fetchAvailableActions() {
    setLoadingActions(true);
    try {
      const data = await postActionsApi.list();
      setAvailableActions(data ?? []);
    } catch {
      toast('error', 'Failed to load post-actions');
    } finally {
      setLoadingActions(false);
    }
  }

  function openLinkModal() {
    setEditingBinding(null);
    setSelectedActionId('');
    setTriggerOn('any');
    setBodyOverride('');
    setBindingEnabled(true);
    setLinkModal(true);
    fetchAvailableActions();
  }

  function openEditModal(binding: PostActionBinding) {
    setEditingBinding(binding);
    setSelectedActionId(binding.post_action_id);
    setTriggerOn(binding.trigger_on);
    setBodyOverride(binding.body_override);
    setBindingEnabled(binding.enabled);
    setLinkModal(true);
    fetchAvailableActions();
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editingBinding) {
        const data: UpdateBindingRequest = {
          trigger_on: triggerOn,
          body_override: bodyOverride,
          enabled: bindingEnabled,
        };
        await postActionsApi.updateBinding(editingBinding.post_action_id, editingBinding.id, data);
        toast('success', 'Binding updated');
      } else {
        if (!selectedActionId) {
          toast('error', 'Please select a post-action');
          setSubmitting(false);
          return;
        }
        const data: CreateBindingRequest = {
          trigger_type: triggerType,
          trigger_id: triggerId,
          trigger_on: triggerOn,
          body_override: bodyOverride,
          enabled: bindingEnabled,
        };
        await postActionsApi.createBinding(selectedActionId, data);
        toast('success', 'Post-action linked');
      }
      setLinkModal(false);
      fetchBindings();
      onBindingChange?.();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to save binding.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlink(binding: PostActionBinding) {
    setUnlinkingId(binding.id);
    try {
      await postActionsApi.deleteBinding(binding.post_action_id, binding.id);
      toast('success', 'Post-action unlinked');
      fetchBindings();
      onBindingChange?.();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to unlink post-action.'));
    } finally {
      setUnlinkingId(null);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-5">
      {/* Header with collapse toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white"
        >
          <svg
            className={`h-4 w-4 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Post-Actions
          {bindings.length > 0 && (
            <span className="ml-1 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
              {bindings.length}
            </span>
          )}
        </button>
        {!collapsed && (
          <button
            onClick={openLinkModal}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Link Post-Action
          </button>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded bg-slate-900/50 p-3">
                  <div className="flex gap-4">
                    <div className="h-4 w-24 rounded bg-slate-700" />
                    <div className="h-4 w-16 rounded bg-slate-700/60" />
                  </div>
                </div>
              ))}
            </div>
          ) : bindings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 py-6 text-center">
              <p className="text-sm text-slate-500">No post-actions linked. Link one to fire HTTP callbacks after runs complete.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                    <th className="pb-2 pr-4">Post-Action</th>
                    <th className="pb-2 pr-4">Condition</th>
                    <th className="pb-2 pr-4">Override</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {bindings.map((binding) => (
                    <tr key={binding.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 pr-4">
                        <button
                          onClick={() => navigate(`/post-actions/${binding.post_action_id}`)}
                          className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {binding.post_action?.name ?? binding.post_action_id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          CONDITION_STYLES[binding.trigger_on] ?? CONDITION_STYLES.any
                        }`}>
                          {binding.trigger_on}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {binding.body_override ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400" title={binding.body_override}>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            Custom
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">Default</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs ${binding.enabled ? 'text-green-400' : 'text-slate-500'}`}>
                          {binding.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(binding)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white"
                            aria-label="Edit binding"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleUnlink(binding)}
                            disabled={unlinkingId === binding.id}
                            className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-red-400 disabled:opacity-50"
                            aria-label="Unlink post-action"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.181 8.68a4.503 4.503 0 011.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 006.364 6.365l3.129-3.129m5.614-5.615l1.757-1.757a4.5 4.5 0 00-6.364-6.365l-3.129 3.129m0 0a4.503 4.503 0 00-1.903 6.405M18 14.07l2.121 2.121M6 7.929L3.879 5.808" />
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
      )}

      {/* Link / Edit modal */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold text-white">
              {editingBinding ? 'Edit Binding' : 'Link Post-Action'}
            </h2>

            <div className="space-y-4">
              {/* Post-Action selector (only for new bindings) */}
              {!editingBinding && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Post-Action *</label>
                  {loadingActions ? (
                    <div className="h-10 animate-pulse rounded bg-slate-800" />
                  ) : (
                    <select
                      value={selectedActionId}
                      onChange={(e) => setSelectedActionId(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Select a post-action...</option>
                      {availableActions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.method.toUpperCase()} {a.url.length > 40 ? a.url.slice(0, 40) + '...' : a.url})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Condition */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Fire When</label>
                <div className="flex gap-2">
                  {(['any', 'success', 'failure'] as TriggerOn[]).map((cond) => (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => setTriggerOn(cond)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        triggerOn === cond
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
                  value={bodyOverride}
                  onChange={(e) => setBodyOverride(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="Leave empty to use the post-action's default body template"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Variables: <code className="text-slate-400">{'{{.Status}}'}</code>,{' '}
                  <code className="text-slate-400">{'{{.TriggerName}}'}</code>,{' '}
                  <code className="text-slate-400">{'{{.RunID}}'}</code>,{' '}
                  <code className="text-slate-400">{'{{.Error}}'}</code>,{' '}
                  <code className="text-slate-400">{'{{.Response}}'}</code>
                </p>
              </div>

              {/* Enabled toggle */}
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
                onClick={() => setLinkModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (!editingBinding && !selectedActionId)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? 'Saving...'
                  : editingBinding ? 'Update' : 'Link'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
