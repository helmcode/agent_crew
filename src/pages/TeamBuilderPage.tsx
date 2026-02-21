import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateTeamRequest } from '../types';
import { teamsApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';
import { generateId } from '../utils/id';

interface AgentDraft {
  id: string;
  name: string;
  claude_md: string;
  sub_agent_description: string;
  sub_agent_skills: string[];
  sub_agent_model: string;
}

const MAX_NAME_LENGTH = 255;

function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}

function autoGrow(e: React.FormEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function generateSubAgentPreview(agent: AgentDraft): string {
  const lines = ['---'];
  lines.push(`name: ${agent.name || '{name}'}`);
  if (agent.sub_agent_description) lines.push(`description: ${agent.sub_agent_description}`);
  if (agent.sub_agent_model && agent.sub_agent_model !== 'inherit') lines.push(`model: ${agent.sub_agent_model}`);
  lines.push('background: true');
  lines.push('isolation: worktree');
  lines.push('permissionMode: bypassPermissions');
  if (agent.sub_agent_skills.length > 0) {
    lines.push('skills:');
    agent.sub_agent_skills.forEach((s) => lines.push(`  - ${s}`));
  }
  lines.push('---');
  return lines.join('\n');
}

export function TeamBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Team config
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');

  // Step 2: Agents
  function defaultClaudeMd(name: string): string {
    return `# Agent: ${name || '{name}'}\n\n## Role\nDescribe the leader's role here.\n\n## Instructions\nDescribe the leader's instructions here.\n\n## Team\nList the sub-agents available to you.\n`;
  }

  const [agents, setAgents] = useState<AgentDraft[]>([
    {
      id: generateId(),
      name: '',
      claude_md: defaultClaudeMd(''),
      sub_agent_description: '',
      sub_agent_skills: [],
      sub_agent_model: 'inherit',
    },
  ]);

  // Transient skill input text per agent (keyed by agent.id)
  const [skillInputs, setSkillInputs] = useState<Record<string, string>>({});

  function addAgent() {
    setAgents([...agents, {
      id: generateId(),
      name: '',
      claude_md: '',
      sub_agent_description: '',
      sub_agent_skills: [],
      sub_agent_model: 'inherit',
    }]);
  }

  function removeAgent(index: number) {
    setAgents(agents.filter((_, i) => i !== index));
  }

  function updateAgent(index: number, field: keyof AgentDraft, value: string) {
    setAgents(agents.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  function addSkill(agentIndex: number) {
    const agentId = agents[agentIndex].id;
    const raw = skillInputs[agentId] ?? '';
    const skill = raw.replace(/,\s*$/, '').trim();
    if (!skill) return;
    setAgents(agents.map((a, i) => {
      if (i !== agentIndex || a.sub_agent_skills.includes(skill)) return a;
      return { ...a, sub_agent_skills: [...a.sub_agent_skills, skill] };
    }));
    setSkillInputs({ ...skillInputs, [agentId]: '' });
  }

  function removeSkill(agentIndex: number, skill: string) {
    setAgents(agents.map((a, i) =>
      i === agentIndex ? { ...a, sub_agent_skills: a.sub_agent_skills.filter((s) => s !== skill) } : a,
    ));
  }

  function handleSkillKeyDown(agentIndex: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const agentId = agents[agentIndex].id;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(agentIndex);
    } else if (e.key === 'Backspace' && !(skillInputs[agentId] ?? '') && agents[agentIndex].sub_agent_skills.length > 0) {
      setAgents(agents.map((a, i) =>
        i === agentIndex ? { ...a, sub_agent_skills: a.sub_agent_skills.slice(0, -1) } : a,
      ));
    }
  }

  function canProceed(): boolean {
    if (step === 1) return isValidName(teamName);
    if (step === 2) {
      return agents.length > 0 && agents.every((a, i) => {
        if (!isValidName(a.name)) return false;
        if (i > 0 && !a.sub_agent_description.trim()) return false;
        return true;
      });
    }
    return true;
  }

  async function handleCreate(deploy: boolean) {
    setSubmitting(true);
    try {
      const teamReq: CreateTeamRequest = {
        name: teamName.trim(),
        description: description.trim() || undefined,
        workspace_path: workspacePath.trim() || undefined,
        agents: agents.map((a, i) => {
          if (i === 0) {
            return {
              name: a.name.trim(),
              role: 'leader' as const,
              claude_md: a.claude_md.trim() || undefined,
            };
          }
          return {
            name: a.name.trim(),
            role: 'worker' as const,
            sub_agent_description: a.sub_agent_description.trim() || undefined,
            sub_agent_skills: a.sub_agent_skills.length > 0 ? a.sub_agent_skills : undefined,
            sub_agent_model: a.sub_agent_model !== 'inherit' ? a.sub_agent_model : undefined,
          };
        }),
      };
      const team = await teamsApi.create(teamReq);

      if (deploy) {
        await teamsApi.deploy(team.id);
        toast('success', 'Team created and deployment started');
      } else {
        toast('success', 'Team created successfully');
      }
      navigate(`/teams/${team.id}`);
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to create team. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-white">Create Team</h1>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                s === step
                  ? 'bg-blue-600 text-white'
                  : s < step
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'bg-slate-800 text-slate-500'
              }`}
            >
              {s < step ? '\u2713' : s}
            </div>
            <span className={`text-sm ${s === step ? 'text-white' : 'text-slate-500'}`}>
              {s === 1 ? 'Team Config' : s === 2 ? 'Agents' : 'Review'}
            </span>
            {s < 3 && <div className="mx-2 h-px w-12 bg-slate-700" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Team Name *</label>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="My Agent Team"
            />
            <p className="mt-1 text-xs text-slate-500">Any name up to {MAX_NAME_LENGTH} characters</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onInput={autoGrow}
              rows={3}
              className="min-h-[80px] max-h-[400px] w-full resize-none overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="What does this team do?"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Workspace Path</label>
            <input
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="/path/to/your/project"
            />
            <p className="mt-1 text-xs text-slate-500">Local directory to mount inside agent containers. Agents can read and write files here.</p>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          {agents.map((agent, i) => (
            <div key={agent.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">
                  {i === 0 ? 'Leader Agent' : `Sub-Agent ${i}`}
                </span>
                {i > 0 && (
                  <button
                    onClick={() => removeAgent(i)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Name *</label>
                  <input
                    value={agent.name}
                    onChange={(e) => updateAgent(i, 'name', e.target.value)}
                    maxLength={MAX_NAME_LENGTH}
                    className={`w-full rounded border bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none ${agent.name.trim() && agent.name.trim().length > MAX_NAME_LENGTH ? 'border-red-500 focus:border-red-500' : 'border-slate-600 focus:border-blue-500'}`}
                    placeholder="Agent name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Role</label>
                  <div className="flex h-[34px] items-center">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${i === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-teal-500/20 text-teal-400'}`}>
                      {i === 0 ? 'Leader' : 'Sub-Agent'}
                    </span>
                  </div>
                </div>
              </div>

              {i === 0 ? (
                /* Leader: CLAUDE.md textarea */
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-slate-400">CLAUDE.md Content</label>
                  <textarea
                    value={agent.claude_md}
                    onChange={(e) => updateAgent(i, 'claude_md', e.target.value)}
                    onInput={autoGrow}
                    rows={6}
                    className="min-h-[80px] max-h-[400px] w-full resize-none overflow-y-auto rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    placeholder="# Agent instructions in Markdown..."
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    This content will be written to the agent's CLAUDE.md file at deploy time.
                  </p>
                </div>
              ) : (
                /* Sub-agent: structured fields */
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Description *</label>
                    <textarea
                      value={agent.sub_agent_description}
                      onChange={(e) => updateAgent(i, 'sub_agent_description', e.target.value)}
                      onInput={autoGrow}
                      rows={2}
                      className="min-h-[80px] max-h-[400px] w-full resize-none overflow-y-auto rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                      placeholder="What does this sub-agent do? The leader uses this to decide when to invoke it."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Skills</label>
                    <div className="flex min-h-[34px] flex-wrap items-center gap-1.5 rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5">
                      {agent.sub_agent_skills.map((skill) => (
                        <span key={skill} className="flex items-center gap-1 rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-200">
                          {skill}
                          <button
                            type="button"
                            onClick={() => removeSkill(i, skill)}
                            className="leading-none text-slate-400 hover:text-white"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        value={skillInputs[agent.id] ?? ''}
                        onChange={(e) => setSkillInputs({ ...skillInputs, [agent.id]: e.target.value })}
                        onKeyDown={(e) => handleSkillKeyDown(i, e)}
                        onBlur={() => addSkill(i)}
                        className="min-w-[120px] flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                        placeholder={agent.sub_agent_skills.length === 0 ? 'Add skill and press Enter' : ''}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Press Enter to add each skill (e.g. Read, Write, Bash).</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Model</label>
                    <select
                      value={agent.sub_agent_model}
                      onChange={(e) => updateAgent(i, 'sub_agent_model', e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="inherit">Inherit (default)</option>
                      <option value="sonnet">Sonnet</option>
                      <option value="opus">Opus</option>
                      <option value="haiku">Haiku</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button
            onClick={addAgent}
            className="w-full rounded-lg border border-dashed border-slate-600 py-2.5 text-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-300"
          >
            + Add Sub-Agent
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-300">Team Configuration</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Name</dt>
              <dd className="text-white">{teamName}</dd>
              <dt className="text-slate-500">Description</dt>
              <dd className="text-white">{description || '-'}</dd>
              <dt className="text-slate-500">Workspace Path</dt>
              <dd className="text-white">{workspacePath || '-'}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-300">Agents ({agents.length})</h3>
            <div className="space-y-2">
              {agents.map((agent, i) => (
                <div key={agent.id} className="rounded bg-slate-900/50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-white">{agent.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${i === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-teal-500/20 text-teal-400'}`}>
                      {i === 0 ? 'leader' : 'sub-agent'}
                    </span>
                  </div>
                  {i === 0 && agent.claude_md && (
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-slate-800 p-2 font-mono text-xs text-slate-400">
                      {agent.claude_md}
                    </pre>
                  )}
                  {i > 0 && (
                    <pre data-testid={`sub-agent-preview-${agent.name || i}`} className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-800 p-2 font-mono text-xs text-slate-400">
                      {generateSubAgentPreview(agent)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="mb-2 text-sm font-medium text-slate-300">JSON Preview</h3>
            <pre className="max-h-48 overflow-auto rounded bg-slate-900 p-3 font-mono text-xs text-slate-300">
              {JSON.stringify(
                {
                  name: teamName,
                  description: description || undefined,
                  workspace_path: workspacePath || undefined,
                  agents: agents.map((a, i) => {
                    if (i === 0) {
                      return {
                        name: a.name,
                        role: 'leader',
                        claude_md: a.claude_md || undefined,
                      };
                    }
                    return {
                      name: a.name,
                      role: 'worker',
                      sub_agent_description: a.sub_agent_description || undefined,
                      sub_agent_skills: a.sub_agent_skills.length > 0 ? a.sub_agent_skills : undefined,
                      sub_agent_model: a.sub_agent_model !== 'inherit' ? a.sub_agent_model : undefined,
                    };
                  }),
                },
                null,
                2,
              )}
            </pre>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => (step === 1 ? navigate('/') : setStep(step - 1))}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <div className="flex gap-2">
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <>
              <button
                onClick={() => handleCreate(false)}
                disabled={submitting}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => handleCreate(true)}
                disabled={submitting}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create & Deploy'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
