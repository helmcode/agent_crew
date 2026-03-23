import { useState, useCallback } from 'react';
import type { Agent, AgentProvider, CreateAgentRequest, UpdateAgentRequest, SkillConfig } from '../types';
import { agentsApi } from '../services/api';
import { toast } from './Toast';
import { MarkdownEditor } from './MarkdownEditor';
import { friendlyError } from '../utils/errors';

const CLAUDE_MODELS = [
  { value: 'inherit', label: 'Inherit (default)' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

const OPENCODE_MODELS = [
  { value: 'inherit', label: 'Inherit (default)', group: '' },
  { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', group: 'Anthropic' },
  { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', group: 'Anthropic' },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5', group: 'Anthropic' },
  { value: 'openai/gpt-5.3-codex', label: 'GPT 5.3 Codex', group: 'OpenAI' },
  { value: 'openai/gpt-5.2', label: 'GPT 5.2', group: 'OpenAI' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', group: 'Google' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', group: 'Google' },
];

const MAX_SKILLS = 20;

interface SubAgentManagerProps {
  teamId: string;
  agents: Agent[];
  provider: AgentProvider;
  onAgentsChanged: () => void;
}

interface AgentFormData {
  name: string;
  sub_agent_description: string;
  sub_agent_instructions: string;
  sub_agent_model: string;
  sub_agent_skills: SkillConfig[];
}

const emptyForm: AgentFormData = {
  name: '',
  sub_agent_description: '',
  sub_agent_instructions: '',
  sub_agent_model: 'inherit',
  sub_agent_skills: [],
};

function agentToForm(agent: Agent): AgentFormData {
  return {
    name: agent.name,
    sub_agent_description: agent.sub_agent_description ?? '',
    sub_agent_instructions: agent.sub_agent_instructions ?? '',
    sub_agent_model: agent.sub_agent_model ?? 'inherit',
    sub_agent_skills: agent.sub_agent_skills ?? [],
  };
}

export function SubAgentManager({ teamId, agents, provider, onAgentsChanged }: SubAgentManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [skillRepo, setSkillRepo] = useState('');
  const [skillName, setSkillName] = useState('');

  const workers = agents.filter((a) => a.role === 'worker');

  const openCreate = useCallback(() => {
    setEditingAgent(null);
    setForm(emptyForm);
    setSkillRepo('');
    setSkillName('');
    setShowForm(true);
  }, []);

  const openEdit = useCallback((agent: Agent) => {
    setEditingAgent(agent);
    setForm(agentToForm(agent));
    setSkillRepo('');
    setSkillName('');
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingAgent(null);
    setForm(emptyForm);
  }, []);

  const addSkill = useCallback(() => {
    const repo = skillRepo.trim();
    const name = skillName.trim();
    if (!repo) { toast('error', 'Repository URL is required'); return; }
    if (!name) { toast('error', 'Skill name is required'); return; }
    try {
      const url = new URL(repo);
      if (url.protocol !== 'https:') { toast('error', 'Repository URL must use HTTPS'); return; }
    } catch { toast('error', 'Invalid repository URL'); return; }
    if (!/^[a-zA-Z0-9@/_.-]+$/.test(name)) { toast('error', 'Invalid skill name'); return; }
    if (form.sub_agent_skills.length >= MAX_SKILLS) { toast('error', `Maximum ${MAX_SKILLS} skills`); return; }
    if (form.sub_agent_skills.some((s) => s.repo_url === repo && s.skill_name === name)) {
      toast('error', 'Skill already added');
      return;
    }
    setForm({ ...form, sub_agent_skills: [...form.sub_agent_skills, { repo_url: repo, skill_name: name }] });
    setSkillRepo('');
    setSkillName('');
  }, [skillRepo, skillName, form]);

  const removeSkill = useCallback((idx: number) => {
    setForm((prev) => ({
      ...prev,
      sub_agent_skills: prev.sub_agent_skills.filter((_, i) => i !== idx),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { toast('error', 'Name is required'); return; }
    if (!form.sub_agent_description.trim()) { toast('error', 'Description is required'); return; }

    setSaving(true);
    try {
      if (editingAgent) {
        const data: UpdateAgentRequest = {
          name: form.name.trim(),
          sub_agent_description: form.sub_agent_description.trim(),
          sub_agent_instructions: form.sub_agent_instructions.trim() || undefined,
          sub_agent_model: form.sub_agent_model !== 'inherit' ? form.sub_agent_model : undefined,
          sub_agent_skills: form.sub_agent_skills.length > 0 ? form.sub_agent_skills : undefined,
        };
        await agentsApi.update(teamId, editingAgent.id, data);
        toast('success', `Agent "${form.name}" updated`);
      } else {
        const data: CreateAgentRequest = {
          name: form.name.trim(),
          role: 'worker',
          sub_agent_description: form.sub_agent_description.trim(),
          sub_agent_instructions: form.sub_agent_instructions.trim() || undefined,
          sub_agent_model: form.sub_agent_model !== 'inherit' ? form.sub_agent_model : undefined,
          sub_agent_skills: form.sub_agent_skills.length > 0 ? form.sub_agent_skills : undefined,
        };
        await agentsApi.create(teamId, data);
        toast('success', `Agent "${form.name}" created`);
      }
      closeForm();
      onAgentsChanged();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to save agent'));
    } finally {
      setSaving(false);
    }
  }, [form, editingAgent, teamId, closeForm, onAgentsChanged]);

  const handleDelete = useCallback(async (agentId: string, agentName: string) => {
    setDeleting(true);
    try {
      await agentsApi.delete(teamId, agentId);
      toast('success', `Agent "${agentName}" deleted`);
      setDeleteConfirm(null);
      onAgentsChanged();
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to delete agent'));
    } finally {
      setDeleting(false);
    }
  }, [teamId, onAgentsChanged]);

  const modelOptions = provider === 'claude' ? CLAUDE_MODELS : OPENCODE_MODELS;

  return (
    <div className="space-y-4 overflow-y-auto" data-testid="subagent-manager">
      {/* Agent List */}
      {workers.length > 0 ? (
        <div className="space-y-2">
          {workers.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2"
              data-testid={`subagent-row-${agent.name}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{agent.name}</span>
                  {agent.sub_agent_model && agent.sub_agent_model !== 'inherit' && (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
                      {agent.sub_agent_model}
                    </span>
                  )}
                </div>
                {agent.sub_agent_description && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">{agent.sub_agent_description}</p>
                )}
              </div>
              <div className="ml-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(agent)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                  data-testid={`edit-subagent-${agent.name}`}
                >
                  Edit
                </button>
                {deleteConfirm === agent.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(agent.id, agent.name)}
                      disabled={deleting}
                      className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {deleting ? '...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      className="text-xs text-slate-400 hover:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(agent.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                    data-testid={`delete-subagent-${agent.name}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center">
          <svg className="mx-auto h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="mt-2 text-sm text-slate-500">No sub-agents configured</p>
          <p className="mt-1 text-xs text-slate-600">Add sub-agents to expand your team</p>
        </div>
      )}

      {/* Create/Edit Form (inline) */}
      {showForm ? (
        <div className="rounded-lg border border-dashed border-slate-700 p-4" data-testid="subagent-form">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-300">
              {editingAgent ? `Edit: ${editingAgent.name}` : 'New Sub-Agent'}
            </h4>
            <button type="button" onClick={closeForm} className="text-xs text-slate-400 hover:text-slate-300">
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                placeholder="agent-name"
                data-testid="subagent-name-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Description *</label>
              <input
                type="text"
                value={form.sub_agent_description}
                onChange={(e) => setForm({ ...form, sub_agent_description: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                placeholder="Short one-liner: what does this sub-agent do?"
                data-testid="subagent-description-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Instructions</label>
              <MarkdownEditor
                value={form.sub_agent_instructions}
                onChange={(md) => setForm({ ...form, sub_agent_instructions: md })}
                placeholder="Detailed instructions for the sub-agent..."
                minHeight="80px"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Model</label>
              <select
                value={form.sub_agent_model}
                onChange={(e) => setForm({ ...form, sub_agent_model: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                data-testid="subagent-model-select"
              >
                {provider === 'claude' ? (
                  modelOptions.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))
                ) : (
                  <>
                    <option value="inherit">Inherit (default)</option>
                    {(() => {
                      const groups = OPENCODE_MODELS.filter((m) => m.group).reduce<Record<string, typeof OPENCODE_MODELS>>((acc, m) => {
                        (acc[m.group] ??= []).push(m);
                        return acc;
                      }, {});
                      return Object.entries(groups).map(([group, models]) => (
                        <optgroup key={group} label={group}>
                          {models.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Skills</label>
              {form.sub_agent_skills.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {form.sub_agent_skills.map((skill, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                      <span className="font-medium">{skill.skill_name}</span>
                      <span className="max-w-[150px] truncate text-[10px] text-slate-400" title={skill.repo_url}>
                        ({skill.repo_url.replace('https://github.com/', '')})
                      </span>
                      <button type="button" onClick={() => removeSkill(idx)} className="ml-1 text-slate-400 hover:text-red-400">
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    value={skillRepo}
                    onChange={(e) => setSkillRepo(e.target.value)}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    placeholder="https://github.com/owner/repo"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    placeholder="skill-name"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                  />
                </div>
                <button type="button" onClick={addSkill} className="rounded bg-slate-700 px-2 py-1.5 text-xs text-white hover:bg-slate-600">
                  Add
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              data-testid="subagent-save-button"
            >
              {saving ? 'Saving...' : editingAgent ? 'Update Sub-Agent' : 'Create Sub-Agent'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCreate}
          className="w-full rounded-lg border border-dashed border-slate-600 py-2.5 text-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-300"
          data-testid="add-subagent-button"
        >
          + Add Sub-Agent
        </button>
      )}
    </div>
  );
}
