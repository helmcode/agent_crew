import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CreatePostActionRequest, PostActionAuthType } from '../types';
import { postActionsApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const AUTH_OPTIONS: { value: PostActionAuthType; label: string }[] = [
  { value: 'none', label: 'No Authentication' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'header', label: 'Custom Header' },
];

export function PostActionBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [loadingAction, setLoadingAction] = useState(!!editId);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState('POST');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [authType, setAuthType] = useState<PostActionAuthType>('none');
  const [authConfig, setAuthConfig] = useState<Record<string, string>>({});
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [retryCount, setRetryCount] = useState(0);
  const [enabled, setEnabled] = useState(true);

  const fetchAction = useCallback(async (id: string) => {
    try {
      const action = await postActionsApi.get(id);
      setName(action.name);
      setDescription(action.description);
      setMethod(action.method);
      setUrl(action.url);
      const headerEntries = Object.entries(action.headers || {}).map(([key, value]) => ({ key, value }));
      setHeaders(headerEntries.length > 0 ? headerEntries : []);
      setBodyTemplate(action.body_template);
      setAuthType(action.auth_type);
      setAuthConfig(action.auth_config || {});
      setTimeoutSeconds(action.timeout_seconds);
      setRetryCount(action.retry_count);
      setEnabled(action.enabled);
    } catch {
      toast('error', 'Failed to load post-action');
      navigate('/post-actions');
    } finally {
      setLoadingAction(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (editId) fetchAction(editId);
  }, [fetchAction, editId]);

  function isValid(): boolean {
    return name.trim().length > 0 && url.trim().length > 0;
  }

  function buildHeadersObject(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) obj[h.key.trim()] = h.value;
    }
    return obj;
  }

  async function handleSubmit() {
    if (!isValid() || submitting) return;
    setSubmitting(true);

    try {
      const headersObj = buildHeadersObject();

      if (editId) {
        await postActionsApi.update(editId, {
          name: name.trim(),
          description: description.trim(),
          method,
          url: url.trim(),
          headers: headersObj,
          body_template: bodyTemplate,
          auth_type: authType,
          auth_config: authType !== 'none' ? authConfig : {},
          timeout_seconds: timeoutSeconds,
          retry_count: retryCount,
          enabled,
        });
        toast('success', 'Post-action updated');
        navigate(`/post-actions/${editId}`);
      } else {
        const payload: CreatePostActionRequest = {
          name: name.trim(),
          description: description.trim(),
          method,
          url: url.trim(),
          headers: headersObj,
          body_template: bodyTemplate,
          auth_type: authType,
          auth_config: authType !== 'none' ? authConfig : {},
          timeout_seconds: timeoutSeconds,
          retry_count: retryCount,
          enabled,
        };
        const created = await postActionsApi.create(payload);
        toast('success', 'Post-action created');
        navigate(`/post-actions/${created.id}`);
      }
    } catch (err) {
      toast('error', friendlyError(err, `Failed to ${editId ? 'update' : 'create'} post-action.`));
    } finally {
      setSubmitting(false);
    }
  }

  function addHeader() {
    setHeaders([...headers, { key: '', value: '' }]);
  }

  function removeHeader(index: number) {
    setHeaders(headers.filter((_, i) => i !== index));
  }

  function updateHeader(index: number, field: 'key' | 'value', val: string) {
    setHeaders(headers.map((h, i) => (i === index ? { ...h, [field]: val } : h)));
  }

  if (loadingAction) {
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
        {editId ? 'Edit Post-Action' : 'Create Post-Action'}
      </h1>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Notify Slack on completion"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Sends a Slack notification when a webhook run finishes"
          />
        </div>

        {/* Method & URL */}
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Method *</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">URL *</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>
        </div>

        {/* Headers */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300">Custom Headers</label>
            <button
              type="button"
              onClick={addHeader}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + Add Header
            </button>
          </div>
          {headers.length === 0 && (
            <p className="text-xs text-slate-500">No custom headers. Click &quot;+ Add Header&quot; to add one.</p>
          )}
          <div className="space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={h.key}
                  onChange={(e) => updateHeader(i, 'key', e.target.value)}
                  className="w-1/3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="Header name"
                />
                <input
                  value={h.value}
                  onChange={(e) => updateHeader(i, 'value', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="Header value"
                />
                <button
                  type="button"
                  onClick={() => removeHeader(i)}
                  className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-700 hover:text-red-400"
                  aria-label="Remove header"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Body Template */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Body Template</label>
          <textarea
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder={'{\n  "text": "Run {{.Status}} for {{.SourceType}} {{.TriggerName}}"\n}'}
          />
          <p className="mt-1 text-xs text-slate-500">
            Available variables: <code className="text-slate-400">{'{{.Status}}'}</code>,{' '}
            <code className="text-slate-400">{'{{.SourceType}}'}</code>,{' '}
            <code className="text-slate-400">{'{{.TriggerName}}'}</code>,{' '}
            <code className="text-slate-400">{'{{.RunID}}'}</code>,{' '}
            <code className="text-slate-400">{'{{.Error}}'}</code>,{' '}
            <code className="text-slate-400">{'{{.Response}}'}</code>
          </p>
        </div>

        {/* Authentication */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Authentication</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {AUTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAuthType(opt.value);
                  setAuthConfig({});
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  authType === opt.value
                    ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {authType === 'bearer' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Bearer Token</label>
              <input
                type="password"
                value={authConfig.token ?? ''}
                onChange={(e) => setAuthConfig({ token: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                placeholder="your-token-here"
              />
            </div>
          )}

          {authType === 'basic' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Username</label>
                <input
                  value={authConfig.username ?? ''}
                  onChange={(e) => setAuthConfig({ ...authConfig, username: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
                <input
                  type="password"
                  value={authConfig.password ?? ''}
                  onChange={(e) => setAuthConfig({ ...authConfig, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="password"
                />
              </div>
            </div>
          )}

          {authType === 'header' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Header Name</label>
                <input
                  value={authConfig.header_name ?? ''}
                  onChange={(e) => setAuthConfig({ ...authConfig, header_name: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="X-API-Key"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Header Value</label>
                <input
                  type="password"
                  value={authConfig.header_value ?? ''}
                  onChange={(e) => setAuthConfig({ ...authConfig, header_value: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="your-api-key"
                />
              </div>
            </div>
          )}
        </div>

        {/* Timeout & Retry */}
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
            <p className="mt-1 text-xs text-slate-500">Max time to wait for the HTTP response. Default: 30.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Retry Count</label>
            <input
              type="number"
              value={retryCount}
              onChange={(e) => setRetryCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
              min={0}
              max={5}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">Number of retries on failure (0-5). Default: 0.</p>
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
            {enabled ? 'Post-action enabled — will fire after triggers' : 'Post-action disabled — will not fire'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => navigate(editId ? `/post-actions/${editId}` : '/post-actions')}
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
              : (editId ? 'Update Post-Action' : 'Create Post-Action')
            }
          </button>
        </div>
      </div>
    </div>
  );
}
