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
  specialty: string;
  system_prompt: string;
  skills: string[];
}

const MAX_NAME_LENGTH = 255;

function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
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
  const [agents, setAgents] = useState<AgentDraft[]>([
    { id: generateId(), name: '', specialty: '', system_prompt: '', skills: [] },
  ]);
  const [skillInput, setSkillInput] = useState<Record<number, string>>({});

  function addAgent() {
    setAgents([...agents, { id: generateId(), name: '', specialty: '', system_prompt: '', skills: [] }]);
  }

  function removeAgent(index: number) {
    setAgents(agents.filter((_, i) => i !== index));
  }

  function updateAgent(index: number, field: keyof AgentDraft, value: string | string[]) {
    setAgents(agents.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  function addSkill(index: number) {
    const skill = skillInput[index]?.trim();
    if (!skill) return;
    const agent = agents[index];
    if (!agent.skills.includes(skill)) {
      updateAgent(index, 'skills', [...agent.skills, skill]);
    }
    setSkillInput({ ...skillInput, [index]: '' });
  }

  function removeSkill(agentIndex: number, skillIndex: number) {
    const agent = agents[agentIndex];
    updateAgent(agentIndex, 'skills', agent.skills.filter((_, i) => i !== skillIndex));
  }

  function canProceed(): boolean {
    if (step === 1) return isValidName(teamName);
    if (step === 2) return agents.length > 0 && agents.every((a) => isValidName(a.name));
    return true;
  }

  async function handleCreate(deploy: boolean) {
    setSubmitting(true);
    try {
      const teamReq: CreateTeamRequest = {
        name: teamName.trim(),
        description: description.trim() || undefined,
        workspace_path: workspacePath.trim() || undefined,
        agents: agents.map((a, i) => ({
          name: a.name.trim(),
          role: i === 0 ? 'leader' : 'worker',
          specialty: a.specialty.trim() || undefined,
          system_prompt: a.system_prompt.trim() || undefined,
          skills: a.skills.length > 0 ? a.skills : undefined,
        })),
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
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="What does this team do?"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Workspace Path</label>
            <input
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="/path/to/workspace"
            />
            <p className="mt-1 text-xs text-slate-500">Working directory for the agents</p>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          {agents.map((agent, i) => (
            <div key={agent.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Agent {i + 1}</span>
                {agents.length > 1 && i !== 0 && (
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
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${i === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
                      {i === 0 ? 'Leader' : 'Worker'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-slate-400">Specialty</label>
                <input
                  value={agent.specialty}
                  onChange={(e) => updateAgent(i, 'specialty', e.target.value)}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. frontend development, testing, code review"
                />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-slate-400">System Prompt</label>
                <textarea
                  value={agent.system_prompt}
                  onChange={(e) => updateAgent(i, 'system_prompt', e.target.value)}
                  rows={2}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="Instructions for the agent..."
                />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-slate-400">Skills</label>
                <div className="flex gap-2">
                  <input
                    value={skillInput[i] ?? ''}
                    onChange={(e) => setSkillInput({ ...skillInput, [i]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(i); } }}
                    className="flex-1 rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    placeholder="Add skill and press Enter"
                  />
                  <button
                    onClick={() => addSkill(i)}
                    className="rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
                  >
                    Add
                  </button>
                </div>
                {agent.skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {agent.skills.map((skill, si) => (
                      <span
                        key={si}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs text-blue-400"
                      >
                        {skill}
                        <button onClick={() => removeSkill(i, si)} className="hover:text-blue-200">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={addAgent}
            className="w-full rounded-lg border border-dashed border-slate-600 py-2.5 text-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-300"
          >
            + Add Agent
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
              <dt className="text-slate-500">Workspace</dt>
              <dd className="font-mono text-white">{workspacePath || '-'}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-300">Agents ({agents.length})</h3>
            <div className="space-y-2">
              {agents.map((agent, i) => (
                <div key={agent.id} className="flex items-center justify-between rounded bg-slate-900/50 px-3 py-2 text-sm">
                  <div>
                    <span className="text-white">{agent.name}</span>
                    {agent.specialty && (
                      <span className="ml-2 text-xs text-slate-500">{agent.specialty}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${i === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
                      {i === 0 ? 'leader' : 'worker'}
                    </span>
                    {agent.skills.length > 0 && (
                      <span className="text-xs text-slate-500">{agent.skills.length} skills</span>
                    )}
                  </div>
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
                  agents: agents.map((a, i) => ({
                    name: a.name,
                    role: i === 0 ? 'leader' : 'worker',
                    specialty: a.specialty || undefined,
                    system_prompt: a.system_prompt || undefined,
                    skills: a.skills.length > 0 ? a.skills : undefined,
                  })),
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
