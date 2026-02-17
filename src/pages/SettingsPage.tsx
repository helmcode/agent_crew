import { useEffect, useState, useCallback } from 'react';
import type { Setting } from '../types';
import { settingsApi } from '../services/api';
import { toast } from '../components/Toast';

export function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit form
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isNewEntry, setIsNewEntry] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await settingsApi.list();
      setSettings(data ?? []);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function startEdit(setting: Setting) {
    setEditKey(setting.key);
    setEditValue(setting.value);
    setIsNewEntry(false);
    setIsEditing(true);
  }

  function startNew() {
    setEditKey('');
    setEditValue('');
    setIsNewEntry(true);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditKey('');
    setEditValue('');
    setIsNewEntry(false);
  }

  async function handleSave() {
    if (!editKey.trim() || saving) return;
    setSaving(true);
    try {
      await settingsApi.upsert({ key: editKey.trim(), value: editValue });
      toast('success', isNewEntry ? 'Setting created' : 'Setting updated');
      cancelEdit();
      fetchSettings();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const filteredSettings = settings.filter(
    (s) =>
      s.key.toLowerCase().includes(search.toLowerCase()) ||
      s.value.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <button
          onClick={startNew}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Add Setting
        </button>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search settings..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Edit/Create Form */}
      {isEditing && (
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-slate-800/50 p-4">
          <h3 className="mb-3 text-sm font-medium text-white">
            {isNewEntry ? 'New Setting' : 'Edit Setting'}
          </h3>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Key</label>
              <input
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
                disabled={!isNewEntry}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                placeholder="setting_key"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Value</label>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                placeholder="value"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelEdit}
              className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!editKey.trim() || saving}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Settings List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg bg-slate-800/50 p-4">
              <div className="flex gap-4">
                <div className="h-4 w-32 rounded bg-slate-700" />
                <div className="h-4 w-48 rounded bg-slate-700/60" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredSettings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-12 text-center">
          <p className="text-slate-500">{settings.length === 0 ? 'No settings configured' : 'No matching settings'}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredSettings.map((setting) => (
            <div
              key={setting.id}
              className="group flex items-center justify-between rounded-lg bg-slate-800/30 px-4 py-3 transition-colors hover:bg-slate-800/60"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-sm text-blue-400">{setting.key}</span>
                <span className="mx-3 text-slate-600">=</span>
                <span className="font-mono text-sm text-slate-300">{setting.value}</span>
              </div>
              <button
                onClick={() => startEdit(setting)}
                className="rounded px-2 py-1 text-xs text-slate-400 opacity-0 transition-opacity hover:bg-slate-700 hover:text-white group-hover:opacity-100"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
