import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentProvider, CreateTeamRequest, SkillConfig, Setting, McpServerConfig, McpTransport } from '../types';
import { teamsApi, settingsApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';
import { generateId } from '../utils/id';

interface AgentDraft {
  id: string;
  name: string;
  instructions_md: string;
  sub_agent_description: string;
  sub_agent_instructions: string;
  sub_agent_skills: SkillConfig[];
  sub_agent_model: string;
}

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

const MODEL_CREDENTIALS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

const MAX_NAME_LENGTH = 255;
const MAX_SKILLS_PER_AGENT = 20;

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
    agent.sub_agent_skills.forEach((s) => {
      lines.push(`  - skill_name: ${s.skill_name}`);
      lines.push(`    repo_url: ${s.repo_url}`);
    });
  }
  lines.push('---');
  if (agent.sub_agent_instructions.trim()) {
    lines.push('');
    lines.push(agent.sub_agent_instructions.trim());
  }
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
  const [provider, setProvider] = useState<AgentProvider>('claude');
  const [agentImage, setAgentImage] = useState('');

  // Step 2: Agents
  function defaultInstructionsMd(name: string): string {
    return `# Agent: ${name || '{name}'}\n\n## Role\nDescribe the leader's role here.\n\n## Instructions\nDescribe the leader's instructions here.\n\n## Team\nList the sub-agents available to you.\n`;
  }

  const [agents, setAgents] = useState<AgentDraft[]>([
    {
      id: generateId(),
      name: '',
      instructions_md: defaultInstructionsMd(''),
      sub_agent_description: '',
      sub_agent_instructions: '',
      sub_agent_skills: [],
      sub_agent_model: 'inherit',
    },
  ]);

  // Transient skill input text per agent (keyed by agent.id)
  const [skillRepoInputs, setSkillRepoInputs] = useState<Record<string, string>>({});
  const [skillNameInputs, setSkillNameInputs] = useState<Record<string, string>>({});

  // MCP Servers (team-wide)
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpDraft, setMcpDraft] = useState<Partial<McpServerConfig>>({ transport: 'stdio' });
  const [mcpArgsText, setMcpArgsText] = useState('');
  const [showMcpRawEditor, setShowMcpRawEditor] = useState(false);
  const [mcpRawJson, setMcpRawJson] = useState('');
  const [mcpRawError, setMcpRawError] = useState('');
  const [mcpEnvKey, setMcpEnvKey] = useState('');
  const [mcpEnvValue, setMcpEnvValue] = useState('');
  const [mcpHeaderKey, setMcpHeaderKey] = useState('');
  const [mcpHeaderValue, setMcpHeaderValue] = useState('');
  const [editingMcpIndex, setEditingMcpIndex] = useState<number | null>(null);

  // Track configured setting keys for credential warnings (OpenCode only).
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (provider !== 'opencode') return;
    settingsApi.list().then((settings: Setting[]) => {
      setConfiguredKeys(new Set(settings.map((s) => s.key)));
    }).catch(() => {});
  }, [provider]);

  const credentialWarnings = useMemo(() => {
    if (provider !== 'opencode') return {} as Record<string, string>;
    const warnings: Record<string, string> = {};
    agents.forEach((agent) => {
      const model = agent.sub_agent_model;
      if (!model || model === 'inherit') return;
      const prefix = model.split('/')[0];
      const requiredKey = MODEL_CREDENTIALS[prefix];
      if (requiredKey && !configuredKeys.has(requiredKey)) {
        warnings[agent.id] = requiredKey;
      }
    });
    return warnings;
  }, [provider, agents, configuredKeys]);

  function addAgent() {
    setAgents([...agents, {
      id: generateId(),
      name: '',
      instructions_md: '',
      sub_agent_description: '',
      sub_agent_instructions: '',
      sub_agent_skills: [],
      sub_agent_model: 'inherit',
    }]);
  }

  function handleProviderChange(newProvider: AgentProvider) {
    if (newProvider === provider) return;
    setProvider(newProvider);
    // Reset all agents' models to 'inherit' since models differ between providers
    setAgents(agents.map((a) => ({ ...a, sub_agent_model: 'inherit' })));
  }

  function removeAgent(index: number) {
    setAgents(agents.filter((_, i) => i !== index));
  }

  function updateAgent(index: number, field: keyof AgentDraft, value: string) {
    setAgents(agents.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  function addSkill(agentIndex: number) {
    const agentId = agents[agentIndex].id;
    const repoUrl = (skillRepoInputs[agentId] ?? '').trim();
    const skillName = (skillNameInputs[agentId] ?? '').trim();

    if (!repoUrl) {
      toast('error', 'Repository URL is required');
      return;
    }
    if (!skillName) {
      toast('error', 'Skill name is required');
      return;
    }

    // Validate URL format
    try {
      const url = new URL(repoUrl);
      if (url.protocol !== 'https:') {
        toast('error', 'Repository URL must use HTTPS');
        return;
      }
    } catch {
      toast('error', 'Invalid repository URL');
      return;
    }

    // Validate skill name
    if (!/^[a-zA-Z0-9@/_.-]+$/.test(skillName)) {
      toast('error', 'Invalid skill name. Use alphanumeric characters, hyphens, underscores, dots.');
      return;
    }

    if (agents[agentIndex].sub_agent_skills.length >= MAX_SKILLS_PER_AGENT) {
      toast('error', `Maximum ${MAX_SKILLS_PER_AGENT} skills per agent.`);
      return;
    }

    // Check for duplicates
    const isDuplicate = agents[agentIndex].sub_agent_skills.some(
      (s) => s.repo_url === repoUrl && s.skill_name === skillName,
    );
    if (isDuplicate) {
      toast('error', 'This skill is already added');
      return;
    }

    const updated = [...agents];
    updated[agentIndex] = {
      ...updated[agentIndex],
      sub_agent_skills: [...updated[agentIndex].sub_agent_skills, { repo_url: repoUrl, skill_name: skillName }],
    };
    setAgents(updated);
    setSkillRepoInputs({ ...skillRepoInputs, [agentId]: '' });
    setSkillNameInputs({ ...skillNameInputs, [agentId]: '' });
  }

  function removeSkill(agentIndex: number, skillIndex: number) {
    setAgents(agents.map((a, i) =>
      i === agentIndex ? { ...a, sub_agent_skills: a.sub_agent_skills.filter((_, sIdx) => sIdx !== skillIndex) } : a,
    ));
  }

  function addMcpServer() {
    const name = (mcpDraft.name ?? '').trim();
    if (!name) { toast('error', 'Server name is required'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { toast('error', 'Server name must be alphanumeric with hyphens/underscores'); return; }
    if (name.length > 64) { toast('error', 'Server name must be at most 64 characters'); return; }
    // Check duplicates, skipping the entry being edited.
    if (mcpServers.some((s, i) => s.name.toLowerCase() === name.toLowerCase() && i !== editingMcpIndex)) {
      toast('error', 'Duplicate server name'); return;
    }

    const transport = mcpDraft.transport ?? 'stdio';
    if (transport === 'stdio' && !mcpDraft.command?.trim()) { toast('error', 'Command is required for stdio transport'); return; }
    if ((transport === 'http' || transport === 'sse') && !mcpDraft.url?.trim()) { toast('error', 'URL is required for ' + transport + ' transport'); return; }

    if ((transport === 'http' || transport === 'sse') && mcpDraft.url) {
      try {
        const u = new URL(mcpDraft.url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') { toast('error', 'URL must use http or https'); return; }
      } catch { toast('error', 'Invalid URL'); return; }
    }

    const parsedArgs = mcpArgsText.split(',').map((s) => s.trim()).filter(Boolean);

    // Auto-include any pending env var typed into the key/value inputs.
    const pendingEnvKey = mcpEnvKey.trim();
    const mergedEnv = { ...(mcpDraft.env ?? {}) };
    if (pendingEnvKey) {
      mergedEnv[pendingEnvKey] = mcpEnvValue.trim();
    }

    // Auto-include any pending header typed into the key/value inputs.
    const pendingHeaderKey = mcpHeaderKey.trim();
    const mergedHeaders = { ...(mcpDraft.headers ?? {}) };
    if (pendingHeaderKey) {
      mergedHeaders[pendingHeaderKey] = mcpHeaderValue.trim();
    }

    const server: McpServerConfig = {
      name,
      transport,
      ...(transport === 'stdio' && {
        command: mcpDraft.command?.trim(),
        args: parsedArgs.length > 0 ? parsedArgs : undefined,
        env: Object.keys(mergedEnv).length > 0 ? mergedEnv : undefined,
      }),
      ...((transport === 'http' || transport === 'sse') && {
        url: mcpDraft.url?.trim(),
        headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
      }),
    };

    if (editingMcpIndex !== null) {
      const updated = [...mcpServers];
      updated[editingMcpIndex] = server;
      setMcpServers(updated);
      setEditingMcpIndex(null);
    } else {
      setMcpServers([...mcpServers, server]);
    }
    setMcpDraft({ transport: 'stdio' });
    setMcpArgsText('');
    setMcpEnvKey(''); setMcpEnvValue('');
    setMcpHeaderKey(''); setMcpHeaderValue('');
  }

  function startEditMcpServer(index: number) {
    const srv = mcpServers[index];
    setEditingMcpIndex(index);
    setMcpDraft({
      name: srv.name,
      transport: srv.transport,
      command: srv.command,
      url: srv.url,
      env: srv.env ? { ...srv.env } : undefined,
      headers: srv.headers ? { ...srv.headers } : undefined,
    });
    setMcpArgsText((srv.args ?? []).join(', '));
    setShowMcpRawEditor(false);
  }

  function cancelEditMcpServer() {
    setEditingMcpIndex(null);
    setMcpDraft({ transport: 'stdio' });
    setMcpArgsText('');
    setMcpEnvKey(''); setMcpEnvValue('');
    setMcpHeaderKey(''); setMcpHeaderValue('');
  }

  function removeMcpServer(index: number) {
    setMcpServers(mcpServers.filter((_, i) => i !== index));
  }

  function addMcpEnvVar() {
    const key = mcpEnvKey.trim();
    const value = mcpEnvValue.trim();
    if (!key) return;
    setMcpDraft({ ...mcpDraft, env: { ...(mcpDraft.env ?? {}), [key]: value } });
    setMcpEnvKey(''); setMcpEnvValue('');
  }

  function removeMcpEnvVar(key: string) {
    const env = { ...(mcpDraft.env ?? {}) };
    delete env[key];
    setMcpDraft({ ...mcpDraft, env });
  }

  function addMcpHeader() {
    const key = mcpHeaderKey.trim();
    const value = mcpHeaderValue.trim();
    if (!key) return;
    setMcpDraft({ ...mcpDraft, headers: { ...(mcpDraft.headers ?? {}), [key]: value } });
    setMcpHeaderKey(''); setMcpHeaderValue('');
  }

  function removeMcpHeader(key: string) {
    const headers = { ...(mcpDraft.headers ?? {}) };
    delete headers[key];
    setMcpDraft({ ...mcpDraft, headers });
  }

  function applyMcpRawJson() {
    try {
      const parsed = JSON.parse(mcpRawJson);

      // 1. Already an array of McpServerConfig — use as-is.
      if (Array.isArray(parsed)) {
        setMcpServers(parsed);
        setMcpRawError('');
        setShowMcpRawEditor(false);
        toast('success', 'MCP servers updated from JSON');
        return;
      }

      // 2. Claude Code format: { "mcpServers": { ... } }
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        const servers: McpServerConfig[] = [];
        for (const [name, entry] of Object.entries(parsed.mcpServers)) {
          const e = entry as Record<string, unknown>;
          const srv: McpServerConfig = { name, transport: 'stdio' };
          if (e.type === 'http') {
            srv.transport = 'http';
            srv.url = e.url as string;
            if (e.headers) srv.headers = e.headers as Record<string, string>;
          } else if (e.url && !e.command) {
            srv.transport = 'sse';
            srv.url = e.url as string;
            if (e.headers) srv.headers = e.headers as Record<string, string>;
          } else {
            srv.transport = 'stdio';
            srv.command = e.command as string;
            if (Array.isArray(e.args)) srv.args = e.args as string[];
            if (e.env) srv.env = e.env as Record<string, string>;
          }
          servers.push(srv);
        }
        setMcpServers(servers);
        setMcpRawError('');
        setShowMcpRawEditor(false);
        toast('success', `${servers.length} MCP server(s) imported from Claude Code format`);
        return;
      }

      // 3. OpenCode format: { "mcp": { ... } }
      if (parsed.mcp && typeof parsed.mcp === 'object') {
        const servers: McpServerConfig[] = [];
        for (const [name, entry] of Object.entries(parsed.mcp)) {
          const e = entry as Record<string, unknown>;
          const srv: McpServerConfig = { name, transport: 'stdio' };
          if (e.type === 'remote') {
            srv.transport = 'http';
            srv.url = e.url as string;
            if (e.headers) srv.headers = e.headers as Record<string, string>;
          } else {
            srv.transport = 'stdio';
            if (e.environment) srv.env = e.environment as Record<string, string>;
            const cmdArray = e.command as string[] | undefined;
            if (Array.isArray(cmdArray) && cmdArray.length > 0) {
              srv.command = cmdArray[0];
              if (cmdArray.length > 1) srv.args = cmdArray.slice(1);
            }
          }
          servers.push(srv);
        }
        setMcpServers(servers);
        setMcpRawError('');
        setShowMcpRawEditor(false);
        toast('success', `${servers.length} MCP server(s) imported from OpenCode format`);
        return;
      }

      setMcpRawError('Unrecognized format. Paste a JSON array, a Claude Code .mcp.json, or an OpenCode opencode.json');
    } catch (e) {
      setMcpRawError('Invalid JSON: ' + (e instanceof Error ? e.message : 'parse error'));
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
        provider,
        agent_image: agentImage.trim() || undefined,
        mcp_servers: mcpServers.length > 0 ? mcpServers : undefined,
        agents: agents.map((a, i) => {
          if (i === 0) {
            return {
              name: a.name.trim(),
              role: 'leader' as const,
              instructions_md: a.instructions_md.trim() || undefined,
              sub_agent_skills: a.sub_agent_skills.length > 0 ? a.sub_agent_skills : undefined,
              sub_agent_model: a.sub_agent_model !== 'inherit' ? a.sub_agent_model : undefined,
            };
          }
          return {
            name: a.name.trim(),
            role: 'worker' as const,
            sub_agent_description: a.sub_agent_description.trim() || undefined,
            sub_agent_instructions: a.sub_agent_instructions.trim() || undefined,
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
          {/* Provider Selector */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Provider *</label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => handleProviderChange('claude')}
                className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                  provider === 'claude'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
                data-testid="provider-card-claude"
              >
                <h4 className={`text-sm font-semibold ${provider === 'claude' ? 'text-blue-400' : 'text-white'}`}>
                  Claude Code
                </h4>
                <p className="mt-1 text-xs text-slate-400">
                  Anthropic's official AI agent. Powered by Claude models.
                </p>
              </div>
              <div
                onClick={() => handleProviderChange('opencode')}
                className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                  provider === 'opencode'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
                data-testid="provider-card-opencode"
              >
                <h4 className={`text-sm font-semibold ${provider === 'opencode' ? 'text-emerald-400' : 'text-white'}`}>
                  OpenCode
                </h4>
                <p className="mt-1 text-xs text-slate-400">
                  Open-source AI agent. Powered by Anthropic, OpenAI, Google, and local models.
                </p>
              </div>
            </div>
          </div>
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
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Custom Agent Image</label>
            <input
              value={agentImage}
              onChange={(e) => setAgentImage(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="Leave empty to use default image"
              data-testid="agent-image-input"
            />
            <p className="mt-1 text-xs text-slate-500">Optional. Use a custom Docker image for agent containers.</p>
            {agentImage.trim() && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2" data-testid="agent-image-info-banner">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-blue-300">
                  Make sure your image is based on the official AgentCrew agent image.{' '}
                  <a href="https://agentcrew.sh/docs/configuration#custom-agent-images" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">
                    See documentation &rarr;
                  </a>
                </p>
              </div>
            )}
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
                /* Leader: instructions textarea + global skills */
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {provider === 'claude' ? 'CLAUDE.md Content' : 'AGENTS.md Content'}
                    </label>
                    <textarea
                      value={agent.instructions_md}
                      onChange={(e) => updateAgent(i, 'instructions_md', e.target.value)}
                      onInput={autoGrow}
                      rows={6}
                      className="min-h-[80px] max-h-[400px] w-full resize-none overflow-y-auto rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                      placeholder="# Agent instructions in Markdown..."
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      This content will be written to the agent's {provider === 'claude' ? 'CLAUDE.md' : 'AGENTS.md'} file at deploy time.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Model</label>
                    <select
                      value={agent.sub_agent_model}
                      onChange={(e) => updateAgent(i, 'sub_agent_model', e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      data-testid="leader-model-select"
                    >
                      {provider === 'claude' ? (
                        CLAUDE_MODELS.map((m) => (
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
                    {credentialWarnings[agent.id] && (
                      <p className="mt-1 text-xs text-amber-400">
                        This model requires {credentialWarnings[agent.id]} to be configured in Settings.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Global Skills (shared with all agents)</label>
                    {agent.sub_agent_skills.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {agent.sub_agent_skills.map((skill, sIdx) => (
                          <span key={sIdx} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                            <span className="font-medium">{skill.skill_name}</span>
                            <span className="truncate max-w-[200px] text-[10px] text-slate-400" title={skill.repo_url}>
                              ({skill.repo_url.replace('https://github.com/', '')})
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSkill(i, sIdx)}
                              className="ml-1 leading-none text-slate-400 hover:text-red-400"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Repository URL</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="https://github.com/owner/repo"
                          value={skillRepoInputs[agent.id] ?? ''}
                          onChange={(e) => setSkillRepoInputs({ ...skillRepoInputs, [agent.id]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(i); } }}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Skill Name</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="skill-name"
                          value={skillNameInputs[agent.id] ?? ''}
                          onChange={(e) => setSkillNameInputs({ ...skillNameInputs, [agent.id]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(i); } }}
                        />
                      </div>
                      <button
                        type="button"
                        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                        onClick={() => addSkill(i)}
                      >
                        Add
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Press Enter or click Add to add each skill. These skills are installed globally on the leader and shared with all agents.</p>
                  </div>
                </div>
              ) : (
                /* Sub-agent: structured fields */
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Description *</label>
                    <input
                      type="text"
                      value={agent.sub_agent_description}
                      onChange={(e) => updateAgent(i, 'sub_agent_description', e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                      placeholder="Short one-liner: what does this sub-agent do?"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Instructions</label>
                    <textarea
                      value={agent.sub_agent_instructions}
                      onChange={(e) => updateAgent(i, 'sub_agent_instructions', e.target.value)}
                      onInput={autoGrow}
                      rows={6}
                      className="min-h-[120px] max-h-[400px] w-full resize-none overflow-y-auto rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                      placeholder="Detailed instructions for the sub-agent (supports Markdown)"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Skills</label>
                    {agent.sub_agent_skills.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {agent.sub_agent_skills.map((skill, sIdx) => (
                          <span key={sIdx} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                            <span className="font-medium">{skill.skill_name}</span>
                            <span className="truncate max-w-[200px] text-[10px] text-slate-400" title={skill.repo_url}>
                              ({skill.repo_url.replace('https://github.com/', '')})
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSkill(i, sIdx)}
                              className="ml-1 leading-none text-slate-400 hover:text-red-400"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Repository URL</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="https://github.com/owner/repo"
                          value={skillRepoInputs[agent.id] ?? ''}
                          onChange={(e) => setSkillRepoInputs({ ...skillRepoInputs, [agent.id]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(i); } }}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Skill Name</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="skill-name"
                          value={skillNameInputs[agent.id] ?? ''}
                          onChange={(e) => setSkillNameInputs({ ...skillNameInputs, [agent.id]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(i); } }}
                        />
                      </div>
                      <button
                        type="button"
                        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                        onClick={() => addSkill(i)}
                      >
                        Add
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Press Enter or click Add to add each skill. Example: URL: https://github.com/jezweb/claude-skills, Name: fastapi</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Model</label>
                    <select
                      value={agent.sub_agent_model}
                      onChange={(e) => updateAgent(i, 'sub_agent_model', e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      {provider === 'claude' ? (
                        CLAUDE_MODELS.map((m) => (
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
                    {credentialWarnings[agent.id] && (
                      <p className="mt-1 text-xs text-amber-400">
                        This model requires {credentialWarnings[agent.id]} to be configured in Settings.
                      </p>
                    )}
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

          {/* MCP Servers (team-wide) */}
          <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-300">MCP Servers</span>
                <span className="ml-2 text-xs text-slate-500">(Team-wide)</span>
              </div>
              <button
                type="button"
                onClick={() => { setShowMcpRawEditor(!showMcpRawEditor); setMcpRawJson(JSON.stringify(mcpServers, null, 2)); setMcpRawError(''); }}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {showMcpRawEditor ? 'Form Editor' : 'Raw JSON'}
              </button>
            </div>

            {showMcpRawEditor ? (
              <div className="space-y-2">
                <textarea
                  value={mcpRawJson}
                  onChange={(e) => { setMcpRawJson(e.target.value); setMcpRawError(''); }}
                  rows={10}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="[]"
                />
                {mcpRawError && <p className="text-xs text-red-400">{mcpRawError}</p>}
                <button
                  type="button"
                  onClick={applyMcpRawJson}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
                >
                  Apply JSON
                </button>
              </div>
            ) : (
              <>
                {/* Configured servers list */}
                {mcpServers.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {mcpServers.map((srv, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded bg-slate-900/50 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-white">{srv.name}</span>
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                            srv.transport === 'stdio' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'
                          }`}>
                            {srv.transport}
                          </span>
                          <span className="ml-2 truncate text-xs text-slate-500">
                            {srv.transport === 'stdio' ? `${srv.command} ${(srv.args ?? []).join(' ')}` : srv.url}
                          </span>
                        </div>
                        <div className="ml-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditMcpServer(idx)}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMcpServer(idx)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add server form */}
                <div className="space-y-3 rounded border border-dashed border-slate-600 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Server Name *</label>
                      <input
                        type="text"
                        value={mcpDraft.name ?? ''}
                        onChange={(e) => setMcpDraft({ ...mcpDraft, name: e.target.value })}
                        className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                        placeholder="postgres-db"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Transport *</label>
                      <select
                        value={mcpDraft.transport ?? 'stdio'}
                        onChange={(e) => setMcpDraft({ ...mcpDraft, transport: e.target.value as McpTransport })}
                        className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="stdio">stdio (local command)</option>
                        <option value="http">http (remote server)</option>
                        <option value="sse">sse (server-sent events)</option>
                      </select>
                    </div>
                  </div>

                  {/* Conditional fields based on transport */}
                  {(mcpDraft.transport ?? 'stdio') === 'stdio' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">Command *</label>
                        <input
                          type="text"
                          value={mcpDraft.command ?? ''}
                          onChange={(e) => setMcpDraft({ ...mcpDraft, command: e.target.value })}
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="npx"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">Arguments (comma-separated)</label>
                        <input
                          type="text"
                          value={mcpArgsText}
                          onChange={(e) => setMcpArgsText(e.target.value)}
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="-y, @modelcontextprotocol/server-postgres"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">Environment Variables</label>
                        {mcpDraft.env && Object.keys(mcpDraft.env).length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {Object.entries(mcpDraft.env).map(([k, v]) => (
                              <span key={k} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                                <span className="font-medium">{k}</span>=<span className="truncate max-w-[150px] text-slate-400">{v}</span>
                                <button type="button" onClick={() => removeMcpEnvVar(k)} className="ml-1 text-slate-400 hover:text-red-400">&times;</button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={mcpEnvKey}
                            onChange={(e) => setMcpEnvKey(e.target.value)}
                            className="flex-1 rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Key"
                          />
                          <input
                            type="text"
                            value={mcpEnvValue}
                            onChange={(e) => setMcpEnvValue(e.target.value)}
                            className="flex-1 rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Value"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMcpEnvVar(); } }}
                          />
                          <button type="button" onClick={addMcpEnvVar} className="rounded bg-slate-700 px-2 py-1.5 text-xs text-white hover:bg-slate-600">Add</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">URL *</label>
                        <input
                          type="text"
                          value={mcpDraft.url ?? ''}
                          onChange={(e) => setMcpDraft({ ...mcpDraft, url: e.target.value })}
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="https://api.example.com/mcp/"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">Headers</label>
                        {mcpDraft.headers && Object.keys(mcpDraft.headers).length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {Object.entries(mcpDraft.headers).map(([k, v]) => (
                              <span key={k} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                                <span className="font-medium">{k}</span>: <span className="truncate max-w-[150px] text-slate-400">{v}</span>
                                <button type="button" onClick={() => removeMcpHeader(k)} className="ml-1 text-slate-400 hover:text-red-400">&times;</button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={mcpHeaderKey}
                            onChange={(e) => setMcpHeaderKey(e.target.value)}
                            className="flex-1 rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Header name"
                          />
                          <input
                            type="text"
                            value={mcpHeaderValue}
                            onChange={(e) => setMcpHeaderValue(e.target.value)}
                            className="flex-1 rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Header value"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMcpHeader(); } }}
                          />
                          <button type="button" onClick={addMcpHeader} className="rounded bg-slate-700 px-2 py-1.5 text-xs text-white hover:bg-slate-600">Add</button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addMcpServer}
                      className="flex-1 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                    >
                      {editingMcpIndex !== null ? 'Save MCP Server' : 'Add MCP Server'}
                    </button>
                    {editingMcpIndex !== null && (
                      <button
                        type="button"
                        onClick={cancelEditMcpServer}
                        className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            <p className="mt-2 text-xs text-slate-500">MCP servers provide external tool access (databases, APIs, services) to all agents in the team.</p>
          </div>
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
              <dt className="text-slate-500">Provider</dt>
              <dd>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  provider === 'claude'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {provider === 'claude' ? 'Claude Code' : 'OpenCode'}
                </span>
              </dd>
              <dt className="text-slate-500">Description</dt>
              <dd className="text-white">{description || '-'}</dd>
              <dt className="text-slate-500">Workspace Path</dt>
              <dd className="text-white">{workspacePath || '-'}</dd>
              <dt className="text-slate-500">Agent Image</dt>
              <dd className="text-white">{agentImage || 'Default (provider-based)'}</dd>
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
                  {i === 0 && agent.instructions_md && (
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-slate-800 p-2 font-mono text-xs text-slate-400">
                      {agent.instructions_md}
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
          {mcpServers.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="mb-3 text-sm font-medium text-slate-300">MCP Servers ({mcpServers.length})</h3>
              <div className="space-y-1">
                {mcpServers.map((srv) => (
                  <div key={srv.name} className="flex items-center gap-2 rounded bg-slate-900/50 px-3 py-1.5 text-sm">
                    <span className="font-medium text-white">{srv.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      srv.transport === 'stdio' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {srv.transport}
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {srv.transport === 'stdio' ? `${srv.command} ${(srv.args ?? []).join(' ')}` : srv.url}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="mb-2 text-sm font-medium text-slate-300">JSON Preview</h3>
            <pre className="max-h-48 overflow-auto rounded bg-slate-900 p-3 font-mono text-xs text-slate-300">
              {JSON.stringify(
                {
                  name: teamName,
                  description: description || undefined,
                  workspace_path: workspacePath || undefined,
                  provider,
                  agent_image: agentImage.trim() || undefined,
                  mcp_servers: mcpServers.length > 0 ? mcpServers : undefined,
                  agents: agents.map((a, i) => {
                    if (i === 0) {
                      return {
                        name: a.name,
                        role: 'leader',
                        instructions_md: a.instructions_md || undefined,
                        sub_agent_skills: a.sub_agent_skills.length > 0 ? a.sub_agent_skills : undefined,
                        sub_agent_model: a.sub_agent_model !== 'inherit' ? a.sub_agent_model : undefined,
                      };
                    }
                    return {
                      name: a.name,
                      role: 'worker',
                      sub_agent_description: a.sub_agent_description || undefined,
                      sub_agent_instructions: a.sub_agent_instructions.trim() || undefined,
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
