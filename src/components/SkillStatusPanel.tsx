import { useState, useRef, useEffect } from 'react';
import type { Agent, SkillStatus, TaskLog } from '../types';
import { agentsApi } from '../services/api';
import { toast } from './Toast';
import { friendlyError } from '../utils/errors';

/** Strip ANSI escape codes from a string for clean display. */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]|\x1B\].*?\x07|\x1B\[[\?]?[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Extract a skill status payload from a skill_status TaskLog,
 * handling both flat and NATS envelope structures.
 */
export function extractSkillPayload(
  log: TaskLog,
): { agent_name: string; skills: SkillStatus[]; summary: string } | null {
  if (log.message_type !== 'skill_status') return null;
  const p = log.payload as Record<string, unknown> | null;
  if (!p) return null;

  // Determine the actual data: flat payload or NATS envelope (payload.payload).
  let inner: Record<string, unknown>;
  if (typeof p.agent_name === 'string') {
    inner = p;
  } else if (p.payload && typeof p.payload === 'object') {
    inner = p.payload as Record<string, unknown>;
  } else {
    return null;
  }

  const agentName =
    typeof inner.agent_name === 'string' ? inner.agent_name : log.from_agent;
  const summary = typeof inner.summary === 'string' ? inner.summary : '';

  const rawSkills = Array.isArray(inner.skills) ? inner.skills : [];
  const skills: SkillStatus[] = rawSkills.map(
    (s: Record<string, unknown>) => ({
      name:
        typeof s.package === 'string'
          ? s.package
          : typeof s.name === 'string'
            ? s.name
            : 'unknown',
      status:
        s.status === 'installed'
          ? 'installed'
          : s.status === 'pending'
            ? 'pending'
            : 'failed',
      error:
        typeof s.error === 'string' && s.error ? s.error : undefined,
    }),
  );

  return { agent_name: agentName, skills, summary };
}

/** Check if a skill_status log contains any failures. */
export function hasFailedSkills(log: TaskLog): boolean {
  const payload = extractSkillPayload(log);
  if (!payload) return false;
  return payload.skills.some((s) => s.status === 'failed');
}

/** Build a human-readable toast message for failed skills. */
export function getFailureMessage(log: TaskLog): string {
  const payload = extractSkillPayload(log);
  if (!payload) return '';
  const failed = payload.skills.filter((s) => s.status === 'failed');
  if (failed.length === 0) return '';
  const names = failed.map((s) => s.name).join(', ');
  return `${payload.agent_name}: Failed to install ${names}`;
}

// --- Status display config ---

const statusConfig: Record<
  string,
  { dot: string; text: string; label: string }
> = {
  installed: {
    dot: 'bg-green-400',
    text: 'text-green-400',
    label: 'Installed',
  },
  pending: {
    dot: 'bg-yellow-400 animate-pulse',
    text: 'text-yellow-400',
    label: 'Installing...',
  },
  failed: {
    dot: 'bg-red-400',
    text: 'text-red-400',
    label: 'Failed',
  },
};

// --- Sub-components ---

function SkillItem({ skill }: { skill: SkillStatus }) {
  const [expanded, setExpanded] = useState(false);
  const style = statusConfig[skill.status] ?? statusConfig.pending;

  return (
    <div data-testid={`skill-item-${skill.name}`}>
      <div className="flex items-center gap-2 py-1">
        <span
          data-testid={`skill-dot-${skill.name}`}
          className={`h-2 w-2 flex-shrink-0 rounded-full ${style.dot}`}
        />
        <span
          className="min-w-0 flex-1 truncate text-xs text-slate-300"
          title={skill.name}
        >
          {skill.name}
        </span>
        <span className={`text-xs ${style.text}`}>{style.label}</span>
        {skill.status === 'failed' && skill.error && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center text-xs text-slate-500 hover:text-slate-300"
            data-testid={`skill-error-toggle-${skill.name}`}
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        )}
      </div>
      {expanded && skill.error && (
        <pre
          data-testid={`skill-error-${skill.name}`}
          className="mb-1 ml-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-red-500/5 px-2 py-1 text-xs text-red-400"
        >
          {stripAnsi(skill.error)}
        </pre>
      )}
    </div>
  );
}

function AgentSkillSection({
  agentName,
  skills,
}: {
  agentName: string;
  skills: SkillStatus[];
}) {
  const installed = skills.filter((s) => s.status === 'installed').length;
  const failed = skills.filter((s) => s.status === 'failed').length;
  const pending = skills.filter((s) => s.status === 'pending').length;

  let summaryColor = 'text-slate-500';
  if (failed > 0) summaryColor = 'text-red-400';
  else if (pending > 0) summaryColor = 'text-yellow-400';
  else if (installed === skills.length) summaryColor = 'text-green-400';

  return (
    <div
      data-testid={`agent-skills-${agentName}`}
      className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300">{agentName}</span>
        <span className={`text-xs ${summaryColor}`}>
          {installed}/{skills.length} installed
          {failed > 0 && `, ${failed} failed`}
          {pending > 0 && `, ${pending} pending`}
        </span>
      </div>
      <div className="mt-1 divide-y divide-slate-800">
        {skills.map((skill) => (
          <SkillItem key={skill.name} skill={skill} />
        ))}
      </div>
    </div>
  );
}

// --- Main panel ---

interface SkillStatusPanelProps {
  agents: Agent[];
}

/** Collapsible panel showing per-agent skill installation status. */
export function SkillStatusPanel({ agents }: SkillStatusPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const agentsWithSkills = agents.filter(
    (a) => a.skill_statuses && a.skill_statuses.length > 0,
  );
  if (agentsWithSkills.length === 0) return null;

  const totalSkills = agentsWithSkills.reduce(
    (sum, a) => sum + (a.skill_statuses?.length ?? 0),
    0,
  );
  const totalFailed = agentsWithSkills.reduce(
    (sum, a) =>
      sum +
      (a.skill_statuses?.filter((s) => s.status === 'failed').length ?? 0),
    0,
  );
  const totalPending = agentsWithSkills.reduce(
    (sum, a) =>
      sum +
      (a.skill_statuses?.filter((s) => s.status === 'pending').length ?? 0),
    0,
  );
  const totalInstalled = agentsWithSkills.reduce(
    (sum, a) =>
      sum +
      (a.skill_statuses?.filter((s) => s.status === 'installed').length ?? 0),
    0,
  );

  let headerColor = 'text-slate-400';
  let borderColor = 'border-slate-700/50';
  if (totalFailed > 0) {
    headerColor = 'text-red-400';
    borderColor = 'border-red-500/20';
  } else if (totalPending > 0) {
    headerColor = 'text-yellow-400';
    borderColor = 'border-yellow-500/20';
  } else if (totalInstalled === totalSkills) {
    headerColor = 'text-green-400';
    borderColor = 'border-green-500/20';
  }

  return (
    <div
      data-testid="skill-status-panel"
      className={`flex-shrink-0 rounded-lg border ${borderColor} bg-slate-800/50`}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2"
        data-testid="skill-panel-toggle"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 ${headerColor}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <span className={`text-xs font-medium ${headerColor}`}>Skills</span>
          <span className="text-xs text-slate-500">
            {totalInstalled}/{totalSkills} installed
            {totalFailed > 0 && (
              <span className="text-red-400"> ({totalFailed} failed)</span>
            )}
            {totalPending > 0 && (
              <span className="text-yellow-400">
                {' '}
                ({totalPending} installing)
              </span>
            )}
          </span>
        </div>
        <svg
          className={`h-3 w-3 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
      {!collapsed && (
        <div className="space-y-2 px-4 pb-3">
          {agentsWithSkills.map((agent) => (
            <AgentSkillSection
              key={agent.id}
              agentName={agent.name}
              skills={agent.skill_statuses!}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SettingsButton — icon button for the chat input area
// ============================================================

interface SettingsButtonProps {
  agents: Agent[];
  onClick: () => void;
  disabled?: boolean;
}

export function SettingsButton({ agents, onClick, disabled }: SettingsButtonProps) {
  const hasFailures = agents.some(
    (a) => a.skill_statuses?.some((s) => s.status === 'failed'),
  );
  const hasPending = agents.some(
    (a) => a.skill_statuses?.some((s) => s.status === 'pending'),
  );
  const hasSkills = agents.some(
    (a) => a.skill_statuses && a.skill_statuses.length > 0,
  );

  let iconColor = 'text-slate-500 hover:text-slate-300';
  if (hasFailures) iconColor = 'text-red-400 hover:text-red-300';
  else if (hasPending) iconColor = 'text-yellow-400 hover:text-yellow-300';
  else if (hasSkills) iconColor = 'text-green-400 hover:text-green-300';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-shrink-0 items-center justify-center rounded-lg p-2 transition-colors ${iconColor} disabled:opacity-50`}
      title="Settings"
      data-testid="settings-button"
    >
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
        />
      </svg>
    </button>
  );
}

// ============================================================
// InstructionsEditor — edit agent CLAUDE.md instructions
// ============================================================

interface InstructionsEditorProps {
  teamId: string;
  agent: Agent;
  onDirtyChange: (dirty: boolean) => void;
}

function InstructionsEditor({ teamId, agent, onDirtyChange }: InstructionsEditorProps) {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'save' | 'discard' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = content !== savedContent;

  // Notify parent when dirty state changes
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);


  // Fetch instructions when agent changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent('');
    setSavedContent('');
    setFilePath('');

    agentsApi
      .getInstructions(teamId, agent.id)
      .then((data) => {
        if (cancelled) return;
        setContent(data.content);
        setSavedContent(data.content);
        setFilePath(data.path);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(friendlyError(err, 'Failed to load instructions.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, agent.id]);

  async function executeSave() {
    setConfirmAction(null);
    setSaving(true);
    try {
      await agentsApi.updateInstructions(teamId, agent.id, content);
      setSavedContent(content);
      toast('success', `Instructions saved for ${agent.name}`);
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to save instructions.'));
    } finally {
      setSaving(false);
    }
  }

  function executeDiscard() {
    setConfirmAction(null);
    setContent(savedContent);
  }

  if (loading) {
    return (
      <div className="space-y-3" data-testid="instructions-loading">
        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-700" />
        <div className="h-32 animate-pulse rounded bg-slate-700/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3"
        data-testid="instructions-error"
      >
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="instructions-editor">
      {filePath && (
        <p className="mb-2 flex-shrink-0 text-xs text-slate-500" data-testid="instructions-path">
          {filePath}
        </p>
      )}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-0 w-full flex-1 resize-none overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        placeholder="# Agent instructions in Markdown..."
        data-testid="instructions-textarea"
      />
      {isDirty && (
        <div className="mt-3 flex flex-shrink-0 items-center justify-center gap-2" data-testid="instructions-actions">
          <button
            onClick={() => setConfirmAction('discard')}
            disabled={saving}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            data-testid="instructions-discard"
          >
            Discard
          </button>
          <button
            onClick={() => setConfirmAction('save')}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            data-testid="instructions-save"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      {/* Confirmation dialog for Save/Discard */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
          data-testid="instructions-confirm-dialog"
        >
          <div className="w-96 rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h4 className="mb-2 text-sm font-semibold text-white">
              {confirmAction === 'save' ? 'Save Changes' : 'Discard Changes'}
            </h4>
            <p className="mb-4 text-sm text-slate-400">
              {confirmAction === 'save'
                ? 'The updated instructions will be written to the agent\'s configuration file. Changes will take effect on the agent\'s next turn.'
                : 'Any unsaved edits will be lost. Are you sure you want to discard your changes?'}
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700"
                data-testid="instructions-confirm-cancel"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction === 'save' ? executeSave : executeDiscard}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors ${
                  confirmAction === 'save'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
                data-testid="instructions-confirm-action"
              >
                {confirmAction === 'save' ? 'Save' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SettingsModal — modal with sidebar for skills management
// ============================================================

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  teamId: string;
  onSkillInstalled: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  agents,
  teamId,
  onSkillInstalled,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('skills');
  const [repoUrl, setRepoUrl] = useState('');
  const [skillName, setSkillName] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [installing, setInstalling] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const installableAgents = agents.filter((a) => a.role === 'worker' || a.role === 'leader');
  const leaderAgent = agents.find((a) => a.role === 'leader');
  const workerAgents = agents.filter((a) => a.role === 'worker');

  // Select first installable agent by default when modal opens
  useEffect(() => {
    if (isOpen && !selectedAgentId && installableAgents.length > 0) {
      setSelectedAgentId(installableAgents[0].id);
    }
  }, [isOpen, installableAgents, selectedAgentId]);

  if (!isOpen) return null;

  const agentsWithSkills = agents.filter(
    (a) => a.skill_statuses && a.skill_statuses.length > 0,
  );
  const totalSkills = agentsWithSkills.reduce(
    (sum, a) => sum + (a.skill_statuses?.length ?? 0),
    0,
  );
  const totalFailed = agentsWithSkills.reduce(
    (sum, a) =>
      sum + (a.skill_statuses?.filter((s) => s.status === 'failed').length ?? 0),
    0,
  );
  const totalInstalled = agentsWithSkills.reduce(
    (sum, a) =>
      sum +
      (a.skill_statuses?.filter((s) => s.status === 'installed').length ?? 0),
    0,
  );

  function handleTabSwitch(tabId: string) {
    if (tabId === activeTab) return;
    if (isDirty) {
      setPendingTab(tabId);
      return;
    }
    setActiveTab(tabId);
  }

  function confirmTabSwitch() {
    if (pendingTab) {
      setIsDirty(false);
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  }

  function cancelTabSwitch() {
    setPendingTab(null);
  }

  function handleModalClose() {
    if (isDirty) {
      setPendingTab('__close__');
      return;
    }
    onClose();
  }

  function confirmClose() {
    setIsDirty(false);
    setPendingTab(null);
    onClose();
  }

  // Resolve the active agent (if any) from the tab ID
  const activeAgent = activeTab.startsWith('agent-')
    ? agents.find((a) => a.id === activeTab.replace('agent-', ''))
    : null;

  // Content header label
  const contentHeaderLabel = activeAgent ? activeAgent.name : 'Skills';

  async function handleInstallSkill() {
    const trimmedRepo = repoUrl.trim();
    const trimmedName = skillName.trim();
    if (!trimmedRepo || !trimmedName || !selectedAgentId) return;

    try {
      const url = new URL(trimmedRepo);
      if (url.protocol !== 'https:') {
        toast('error', 'Repository URL must use HTTPS');
        return;
      }
    } catch {
      toast('error', 'Invalid repository URL');
      return;
    }

    if (!/^[a-zA-Z0-9@/_.-]+$/.test(trimmedName)) {
      toast('error', 'Invalid skill name');
      return;
    }

    const agent = agents.find((a) => a.id === selectedAgentId);
    if (!agent) return;

    const existingSkills = agent.sub_agent_skills ?? [];
    if (
      existingSkills.some(
        (s) => s.repo_url === trimmedRepo && s.skill_name === trimmedName,
      )
    ) {
      toast('error', 'This skill is already added to this agent');
      return;
    }

    setInstalling(true);
    try {
      await agentsApi.update(teamId, agent.id, {
        sub_agent_skills: [
          ...existingSkills,
          { repo_url: trimmedRepo, skill_name: trimmedName },
        ],
      });

      // Trigger runtime installation via the target agent's ID.
      // The backend finds the leader container for exec but updates
      // skill_statuses on the target agent.
      try {
        await agentsApi.installSkill(teamId, agent.id, {
          repo_url: trimmedRepo,
          skill_name: trimmedName,
        });
        toast('success', `Skill "${trimmedName}" installed on ${agent.name}`);
      } catch (installErr) {
        toast(
          'error',
          `Skill saved but runtime install failed: ${installErr instanceof Error ? installErr.message : 'Unknown error'}`,
        );
      }

      setRepoUrl('');
      setSkillName('');
      onSkillInstalled();
    } catch (err) {
      toast(
        'error',
        err instanceof Error ? err.message : 'Failed to add skill',
      );
    } finally {
      setInstalling(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) handleModalClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="settings-modal"
    >
      <div className="flex h-[80vh] w-[900px] max-w-[90vw] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Sidebar */}
        <div className="flex w-48 flex-shrink-0 flex-col border-r border-slate-700 bg-slate-800/50">
          <div className="border-b border-slate-700 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Settings</h2>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {/* Agent entries */}
            {leaderAgent && (
              <button
                onClick={() => handleTabSwitch(`agent-${leaderAgent.id}`)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeTab === `agent-${leaderAgent.id}`
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'
                }`}
                data-testid={`settings-tab-agent-${leaderAgent.id}`}
              >
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="truncate">{leaderAgent.name}</span>
              </button>
            )}
            {workerAgents.map((worker) => (
              <button
                key={worker.id}
                onClick={() => handleTabSwitch(`agent-${worker.id}`)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 pl-7 text-sm transition-colors ${
                  activeTab === `agent-${worker.id}`
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'
                }`}
                data-testid={`settings-tab-agent-${worker.id}`}
              >
                <span className="truncate">{worker.name}</span>
              </button>
            ))}

            {/* Separator */}
            {leaderAgent && (
              <div className="my-2 border-t border-slate-700" data-testid="settings-sidebar-separator" />
            )}

            {/* Skills tab */}
            <button
              onClick={() => handleTabSwitch('skills')}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeTab === 'skills'
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'
              }`}
              data-testid="settings-tab-skills"
            >
              <svg
                className="h-4 w-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              Skills
              {totalFailed > 0 && (
                <span className="ml-auto rounded-full bg-red-500/20 px-1.5 py-0.5 text-xs text-red-400">
                  {totalFailed}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Main content */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white">{contentHeaderLabel}</h3>
              {activeTab === 'skills' && totalSkills > 0 && (
                <span className="text-xs text-slate-500">
                  {totalInstalled}/{totalSkills} installed
                  {totalFailed > 0 && (
                    <span className="text-red-400">
                      {' '}
                      ({totalFailed} failed)
                    </span>
                  )}
                </span>
              )}
              {activeAgent && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  activeAgent.role === 'leader'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-teal-500/20 text-teal-400'
                }`}>
                  {activeAgent.role}
                </span>
              )}
            </div>
            <button
              onClick={handleModalClose}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              data-testid="settings-modal-close"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4">
            {activeTab === 'skills' && (
              <div className="space-y-4 overflow-y-auto">
                {agentsWithSkills.length > 0 ? (
                  agentsWithSkills.map((agent) => (
                    <div
                      key={agent.id}
                      className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3"
                      data-testid={`modal-agent-skills-${agent.name}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-300">
                          {agent.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {
                            agent.skill_statuses!.filter(
                              (s) => s.status === 'installed',
                            ).length
                          }
                          /{agent.skill_statuses!.length}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-800">
                        {agent.skill_statuses!.map((skill) => (
                          <SkillItem key={skill.name} skill={skill} />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center">
                    <svg
                      className="mx-auto h-8 w-8 text-slate-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                    <p className="mt-2 text-sm text-slate-500">
                      No skills installed yet
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Add skills to your agents below
                    </p>
                  </div>
                )}

                {installableAgents.length > 0 && (
                  <div
                    className="rounded-lg border border-dashed border-slate-700 p-4"
                    data-testid="install-skill-form"
                  >
                    <h4 className="mb-3 text-sm font-medium text-slate-300">
                      Install New Skill
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">
                          Agent
                        </label>
                        <select
                          value={selectedAgentId}
                          onChange={(e) => setSelectedAgentId(e.target.value)}
                          className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                          data-testid="skill-agent-select"
                        >
                          {installableAgents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}{a.role === 'leader' ? ' (global)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">
                          Repository URL
                        </label>
                        <input
                          type="text"
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="https://github.com/owner/repo"
                          data-testid="skill-repo-input"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">
                          Skill Name
                        </label>
                        <input
                          type="text"
                          value={skillName}
                          onChange={(e) => setSkillName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleInstallSkill();
                            }
                          }}
                          className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="skill-name"
                          data-testid="skill-name-input"
                        />
                      </div>
                      <button
                        onClick={handleInstallSkill}
                        disabled={
                          installing ||
                          !repoUrl.trim() ||
                          !skillName.trim() ||
                          !selectedAgentId
                        }
                        className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                        data-testid="skill-install-button"
                      >
                        {installing ? 'Adding...' : 'Add Skill'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Agent instructions tab */}
            {activeAgent && (
              <div className="flex min-h-0 flex-1 flex-col" data-testid={`instructions-panel-${activeAgent.id}`}>
                <InstructionsEditor
                  teamId={teamId}
                  agent={activeAgent}
                  onDirtyChange={setIsDirty}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation dialog for unsaved changes */}
      {pendingTab !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          data-testid="unsaved-changes-dialog"
        >
          <div className="w-96 rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h4 className="mb-2 text-sm font-semibold text-white">Unsaved Changes</h4>
            <p className="mb-4 text-sm text-slate-400">
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={cancelTabSwitch}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700"
                data-testid="unsaved-changes-cancel"
              >
                Stay
              </button>
              <button
                onClick={pendingTab === '__close__' ? confirmClose : confirmTabSwitch}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
                data-testid="unsaved-changes-confirm"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
