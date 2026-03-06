import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Team, CreateWebhookRequest } from '../types';
import { teamsApi, webhooksApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';
import { copyToClipboard } from '../utils/clipboard';

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function WebhookBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingWebhook, setLoadingWebhook] = useState(!!editId);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState(3600);
  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [enabled, setEnabled] = useState(true);

  // Token modal
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdWebhookId, setCreatedWebhookId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const variables = useMemo(() => extractVariables(promptTemplate), [promptTemplate]);

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

  // Fetch existing webhook for edit mode
  const fetchWebhook = useCallback(async (id: string) => {
    try {
      const webhook = await webhooksApi.get(id);
      setName(webhook.name);
      setTeamId(webhook.team_id);
      setPromptTemplate(webhook.prompt_template);
      setTimeoutSeconds(webhook.timeout_seconds);
      setMaxConcurrent(webhook.max_concurrent);
      setEnabled(webhook.enabled);
    } catch {
      toast('error', 'Failed to load webhook');
      navigate('/webhooks');
    } finally {
      setLoadingWebhook(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchTeams();
    if (editId) fetchWebhook(editId);
  }, [fetchTeams, fetchWebhook, editId]);

  function isValid(): boolean {
    return name.trim().length > 0 && teamId.length > 0 && promptTemplate.trim().length > 0;
  }

  async function handleSubmit() {
    if (!isValid() || submitting) return;
    setSubmitting(true);

    try {
      if (editId) {
        await webhooksApi.update(editId, {
          name: name.trim(),
          prompt_template: promptTemplate.trim(),
          timeout_seconds: timeoutSeconds,
          max_concurrent: maxConcurrent,
          enabled,
        });
        toast('success', 'Webhook updated');
        navigate(`/webhooks/${editId}`);
      } else {
        const payload: CreateWebhookRequest = {
          name: name.trim(),
          team_id: teamId,
          prompt_template: promptTemplate.trim(),
          timeout_seconds: timeoutSeconds,
          max_concurrent: maxConcurrent,
          enabled,
        };
        const result = await webhooksApi.create(payload);
        setCreatedToken(result.token);
        setCreatedWebhookId(result.webhook.id);
      }
    } catch (err) {
      toast('error', friendlyError(err, `Failed to ${editId ? 'update' : 'create'} webhook.`));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyToken() {
    if (!createdToken) return;
    try {
      await copyToClipboard(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('error', 'Failed to copy to clipboard');
    }
  }

  function handleTokenDone() {
    if (createdWebhookId) {
      navigate(`/webhooks/${createdWebhookId}`);
    }
  }

  if (loadingWebhook || loadingTeams) {
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

  // Token modal after creation
  if (createdToken) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Webhook Created</h2>
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
            <label className="mb-1 block text-xs font-medium text-slate-400">Webhook Token</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-green-400">
                {createdToken}
              </code>
              <button
                onClick={handleCopyToken}
                className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleTokenDone}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-white">
        {editId ? 'Edit Webhook' : 'Create Webhook'}
      </h1>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Deploy on push"
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

        {/* Prompt Template */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Prompt Template *</label>
          <textarea
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Deploy {{service}} to {{environment}} with image tag {{tag}}"
          />
          <p className="mt-1 text-xs text-slate-500">
            Use {'{{variable_name}}'} syntax for dynamic values. Variables will be replaced when the webhook is triggered.
          </p>
          {variables.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <span key={v} className="inline-flex items-center rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Timeout & Max Concurrent */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Timeout (seconds)</label>
            <input
              type="number"
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Math.max(1, parseInt(e.target.value, 10) || 1))}
              min={1}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">Max execution time before timeout. Default: 3600 (1 hour).</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Max Concurrent</label>
            <input
              type="number"
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Math.max(1, parseInt(e.target.value, 10) || 1))}
              min={1}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">Max simultaneous executions. Default: 1.</p>
          </div>
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
            {enabled ? 'Webhook enabled — will accept triggers' : 'Webhook disabled — will reject triggers'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => navigate(editId ? `/webhooks/${editId}` : '/webhooks')}
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
              : (editId ? 'Update Webhook' : 'Create Webhook')
            }
          </button>
        </div>
      </div>
    </div>
  );
}
