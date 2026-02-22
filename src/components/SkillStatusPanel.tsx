import { useState } from 'react';
import type { Agent, SkillStatus, TaskLog } from '../types';

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
          className="mb-1 ml-4 rounded bg-red-500/5 px-2 py-1 text-xs text-red-400"
        >
          {skill.error}
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
