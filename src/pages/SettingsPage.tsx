import { useEffect, useState, useCallback, useRef } from 'react';
import type { Setting } from '../types';
import { settingsApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

export function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit form
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editIsSecret, setEditIsSecret] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isNewEntry, setIsNewEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await settingsApi.list();
      setSettings(data ?? []);
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to load variables. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    if (menuOpen !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  function startEdit(setting: Setting) {
    setEditKey(setting.key);
    setEditValue(setting.is_secret ? '' : setting.value);
    setEditIsSecret(setting.is_secret);
    setIsNewEntry(false);
    setIsEditing(true);
  }

  function startNew() {
    setEditKey('');
    setEditValue('');
    setEditIsSecret(false);
    setIsNewEntry(true);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditKey('');
    setEditValue('');
    setEditIsSecret(false);
    setIsNewEntry(false);
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete variable "${key}"?`)) return;
    try {
      await settingsApi.delete(key);
      toast('success', 'Variable deleted');
      fetchSettings();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to delete variable. Please try again.'));
    }
  }

  async function handleSave() {
    if (!editKey.trim() || saving) return;
    setSaving(true);
    try {
      await settingsApi.upsert({ key: editKey.trim(), value: editValue, is_secret: editIsSecret });
      toast('success', isNewEntry ? 'Variable created' : 'Variable updated');
      cancelEdit();
      fetchSettings();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to save variable. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  const filteredSettings = settings.filter(
    (s) =>
      s.key.toLowerCase().includes(search.toLowerCase()) ||
      (!s.is_secret && s.value.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Variables</h1>
        <button
          onClick={startNew}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Variable
        </button>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search variables..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Edit/Create Form */}
      {isEditing && (
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-slate-800/50 p-4">
          <h3 className="mb-3 text-sm font-medium text-white">
            {isNewEntry ? 'New Variable' : 'Edit Variable'}
          </h3>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Key</label>
              <input
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
                disabled={!isNewEntry}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                placeholder="variable_key"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Value</label>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                type={editIsSecret ? 'password' : 'text'}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                placeholder={editIsSecret ? 'Enter secret value' : 'value'}
              />
            </div>
          </div>
          {/* Secret toggle */}
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={editIsSecret}
              onClick={() => setEditIsSecret(!editIsSecret)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                editIsSecret ? 'bg-blue-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  editIsSecret ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secret (value will be obfuscated)
            </label>
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

      {/* Variables List */}
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
          <p className="text-slate-500">{settings.length === 0 ? 'No variables configured' : 'No matching variables'}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredSettings.map((setting) => (
            <div
              key={setting.id}
              className="group flex items-center justify-between rounded-lg bg-slate-800/30 px-4 py-3 transition-colors hover:bg-slate-800/60"
            >
              <div className="flex min-w-0 flex-1 items-center">
                <span className="font-mono text-sm text-blue-400">{setting.key}</span>
                <span className="mx-3 text-slate-600">=</span>
                {setting.is_secret ? (
                  <span className="flex items-center gap-1.5 font-mono text-sm text-slate-500">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    ••••••••
                  </span>
                ) : (
                  <span className="font-mono text-sm text-slate-300">{setting.value}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Pencil edit icon */}
                <button
                  onClick={() => startEdit(setting)}
                  className="rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                  aria-label={`Edit ${setting.key}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                {/* Three-dot menu */}
                <div className="relative" ref={menuOpen === setting.id ? menuRef : undefined}>
                  <button
                    onClick={() => setMenuOpen(menuOpen === setting.id ? null : setting.id)}
                    className="rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                    aria-label={`Menu for ${setting.key}`}
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  {menuOpen === setting.id && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-lg">
                      <button
                        onClick={() => {
                          setMenuOpen(null);
                          startEdit(setting);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(null);
                          handleDelete(setting.key);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
