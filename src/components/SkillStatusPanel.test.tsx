import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SkillStatusPanel,
  extractSkillPayload,
  hasFailedSkills,
  getFailureMessage,
} from './SkillStatusPanel';
import type { Agent, TaskLog } from '../types';
import { mockAgent, mockWorkerAgent } from '../test/mocks';

// --- Helper factories ---

function makeSkillLog(
  overrides: Partial<TaskLog> & { payload: unknown },
): TaskLog {
  return {
    id: 'log-skill-1',
    team_id: 'team-uuid-1',
    message_id: 'msg-skill-1',
    from_agent: 'researcher',
    to_agent: 'relay',
    message_type: 'skill_status',
    created_at: '2026-01-01T00:00:10Z',
    ...overrides,
  };
}

function makeAgent(
  overrides: Partial<Agent>,
): Agent {
  return { ...mockAgent, ...overrides };
}

// ============================================================
// extractSkillPayload
// ============================================================

describe('extractSkillPayload', () => {
  it('returns null for non-skill_status messages', () => {
    const log = makeSkillLog({
      message_type: 'user_message',
      payload: { agent_name: 'a', skills: [] },
    });
    expect(extractSkillPayload(log)).toBeNull();
  });

  it('returns null for null payload', () => {
    const log = makeSkillLog({ payload: null });
    expect(extractSkillPayload(log)).toBeNull();
  });

  it('returns null when payload has no agent_name and no nested payload', () => {
    const log = makeSkillLog({ payload: { foo: 'bar' } });
    expect(extractSkillPayload(log)).toBeNull();
  });

  it('extracts flat payload', () => {
    const log = makeSkillLog({
      payload: {
        agent_name: 'researcher',
        skills: [
          { package: '@anthropic/tool-read', status: 'installed', error: '' },
          { package: 'bad-skill', status: 'failed', error: 'npm ERR! 404' },
        ],
        summary: '1 installed, 1 failed',
      },
    });
    const result = extractSkillPayload(log);
    expect(result).not.toBeNull();
    expect(result!.agent_name).toBe('researcher');
    expect(result!.summary).toBe('1 installed, 1 failed');
    expect(result!.skills).toHaveLength(2);
    expect(result!.skills[0]).toEqual({
      name: '@anthropic/tool-read',
      status: 'installed',
      error: undefined,
    });
    expect(result!.skills[1]).toEqual({
      name: 'bad-skill',
      status: 'failed',
      error: 'npm ERR! 404',
    });
  });

  it('handles NATS envelope (payload.payload)', () => {
    const log = makeSkillLog({
      payload: {
        payload: {
          agent_name: 'dev',
          skills: [{ package: 'pkg-a', status: 'installed' }],
          summary: '1 installed',
        },
      },
    });
    const result = extractSkillPayload(log);
    expect(result).not.toBeNull();
    expect(result!.agent_name).toBe('dev');
    expect(result!.skills).toHaveLength(1);
    expect(result!.skills[0].name).toBe('pkg-a');
  });

  it('falls back to name field when package is missing', () => {
    const log = makeSkillLog({
      payload: {
        agent_name: 'a',
        skills: [{ name: 'my-skill', status: 'pending' }],
        summary: '',
      },
    });
    const result = extractSkillPayload(log);
    expect(result!.skills[0].name).toBe('my-skill');
    expect(result!.skills[0].status).toBe('pending');
  });

  it('falls back to from_agent when agent_name is missing in inner payload', () => {
    const log = makeSkillLog({
      from_agent: 'fallback-agent',
      payload: {
        payload: {
          skills: [{ package: 'x', status: 'installed' }],
          summary: '',
        },
      },
    });
    const result = extractSkillPayload(log);
    expect(result!.agent_name).toBe('fallback-agent');
  });

  it('maps unknown status values to failed', () => {
    const log = makeSkillLog({
      payload: {
        agent_name: 'a',
        skills: [{ package: 'x', status: 'unknown_status' }],
        summary: '',
      },
    });
    const result = extractSkillPayload(log);
    expect(result!.skills[0].status).toBe('failed');
  });
});

// ============================================================
// hasFailedSkills
// ============================================================

describe('hasFailedSkills', () => {
  it('returns true when failures exist', () => {
    const log = makeSkillLog({
      payload: {
        agent_name: 'a',
        skills: [{ package: 'x', status: 'failed', error: 'err' }],
        summary: '',
      },
    });
    expect(hasFailedSkills(log)).toBe(true);
  });

  it('returns false when all installed', () => {
    const log = makeSkillLog({
      payload: {
        agent_name: 'a',
        skills: [{ package: 'x', status: 'installed' }],
        summary: '',
      },
    });
    expect(hasFailedSkills(log)).toBe(false);
  });

  it('returns false for non-skill_status messages', () => {
    const log = makeSkillLog({
      message_type: 'user_message',
      payload: { agent_name: 'a', skills: [{ package: 'x', status: 'failed' }] },
    });
    expect(hasFailedSkills(log)).toBe(false);
  });
});

// ============================================================
// getFailureMessage
// ============================================================

describe('getFailureMessage', () => {
  it('returns message with agent name and failed skill names', () => {
    const log = makeSkillLog({
      payload: {
        agent_name: 'researcher',
        skills: [
          { package: 'good-skill', status: 'installed' },
          { package: 'bad-skill', status: 'failed', error: 'err' },
          { package: 'worse-skill', status: 'failed', error: 'err2' },
        ],
        summary: '',
      },
    });
    expect(getFailureMessage(log)).toBe(
      'researcher: Failed to install bad-skill, worse-skill',
    );
  });

  it('returns empty string when no failures', () => {
    const log = makeSkillLog({
      payload: {
        agent_name: 'a',
        skills: [{ package: 'x', status: 'installed' }],
        summary: '',
      },
    });
    expect(getFailureMessage(log)).toBe('');
  });

  it('returns empty string for non-skill_status', () => {
    const log = makeSkillLog({
      message_type: 'error',
      payload: {},
    });
    expect(getFailureMessage(log)).toBe('');
  });
});

// ============================================================
// SkillStatusPanel component
// ============================================================

describe('SkillStatusPanel', () => {
  it('returns null when no agents have skills', () => {
    const { container } = render(
      <SkillStatusPanel agents={[makeAgent({ id: 'a1', skill_statuses: [] })]} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when agents is empty', () => {
    const { container } = render(<SkillStatusPanel agents={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders panel when agents have skills', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [
          { name: 'skill-a', status: 'installed' },
          { name: 'skill-b', status: 'installed' },
        ],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    expect(screen.getByTestId('skill-status-panel')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getAllByText('2/2 installed')).toHaveLength(2); // header + agent section
  });

  it('shows installed count and green styling when all installed', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [
          { name: 'skill-a', status: 'installed' },
        ],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    const skillsLabel = screen.getByText('Skills');
    expect(skillsLabel.className).toContain('text-green-400');
  });

  it('shows failed count and red styling when failures exist', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [
          { name: 'skill-a', status: 'installed' },
          { name: 'skill-b', status: 'failed', error: 'npm ERR!' },
        ],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    expect(screen.getByText('(1 failed)')).toBeTruthy();
    const skillsLabel = screen.getByText('Skills');
    expect(skillsLabel.className).toContain('text-red-400');
  });

  it('shows pending count and yellow styling when installing', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [
          { name: 'skill-a', status: 'pending' },
        ],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    expect(screen.getByText('(1 installing)')).toBeTruthy();
    const skillsLabel = screen.getByText('Skills');
    expect(skillsLabel.className).toContain('text-yellow-400');
  });

  it('collapses and expands the panel on toggle click', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [{ name: 'skill-a', status: 'installed' }],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    // Initially expanded — agent section visible
    expect(screen.getByTestId('agent-skills-dev')).toBeTruthy();

    // Collapse
    fireEvent.click(screen.getByTestId('skill-panel-toggle'));
    expect(screen.queryByTestId('agent-skills-dev')).toBeNull();

    // Expand again
    fireEvent.click(screen.getByTestId('skill-panel-toggle'));
    expect(screen.getByTestId('agent-skills-dev')).toBeTruthy();
  });

  it('renders multiple agents with skills', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'frontend-dev',
        skill_statuses: [{ name: 'skill-1', status: 'installed' }],
      }),
      makeAgent({
        id: 'a2',
        name: 'backend-dev',
        skill_statuses: [{ name: 'skill-2', status: 'failed', error: 'err' }],
      }),
      makeAgent({
        id: 'a3',
        name: 'no-skills-agent',
        skill_statuses: [],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    expect(screen.getByTestId('agent-skills-frontend-dev')).toBeTruthy();
    expect(screen.getByTestId('agent-skills-backend-dev')).toBeTruthy();
    // Agent without skills should not appear
    expect(screen.queryByTestId('agent-skills-no-skills-agent')).toBeNull();
  });

  it('shows per-agent summary with installed/failed counts', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [
          { name: 'a', status: 'installed' },
          { name: 'b', status: 'failed', error: 'err' },
          { name: 'c', status: 'pending' },
        ],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    const section = screen.getByTestId('agent-skills-dev');
    expect(section.textContent).toContain('1/3 installed');
    expect(section.textContent).toContain('1 failed');
    expect(section.textContent).toContain('1 pending');
  });
});

// ============================================================
// SkillItem — individual skill rendering
// ============================================================

describe('SkillItem (via SkillStatusPanel)', () => {
  it('shows installed skill with green dot and Installed label', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [{ name: '@anthropic/tool-read', status: 'installed' }],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    const item = screen.getByTestId('skill-item-@anthropic/tool-read');
    expect(item.textContent).toContain('@anthropic/tool-read');
    expect(item.textContent).toContain('Installed');
    const dot = screen.getByTestId('skill-dot-@anthropic/tool-read');
    expect(dot.className).toContain('bg-green-400');
  });

  it('shows pending skill with yellow animated dot and Installing label', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [{ name: 'pending-skill', status: 'pending' }],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    const item = screen.getByTestId('skill-item-pending-skill');
    expect(item.textContent).toContain('Installing...');
    const dot = screen.getByTestId('skill-dot-pending-skill');
    expect(dot.className).toContain('bg-yellow-400');
    expect(dot.className).toContain('animate-pulse');
  });

  it('shows failed skill with red dot, Failed label, and expandable error', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [
          { name: 'bad-skill', status: 'failed', error: 'npm ERR! 404 Not Found' },
        ],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    const item = screen.getByTestId('skill-item-bad-skill');
    expect(item.textContent).toContain('Failed');
    const dot = screen.getByTestId('skill-dot-bad-skill');
    expect(dot.className).toContain('bg-red-400');

    // Error not visible initially
    expect(screen.queryByTestId('skill-error-bad-skill')).toBeNull();

    // Click toggle to expand error
    fireEvent.click(screen.getByTestId('skill-error-toggle-bad-skill'));
    const errorEl = screen.getByTestId('skill-error-bad-skill');
    expect(errorEl.textContent).toContain('npm ERR! 404 Not Found');

    // Click again to collapse
    fireEvent.click(screen.getByTestId('skill-error-toggle-bad-skill'));
    expect(screen.queryByTestId('skill-error-bad-skill')).toBeNull();
  });

  it('does not show error toggle for failed skill without error message', () => {
    const agents: Agent[] = [
      makeAgent({
        id: 'a1',
        name: 'dev',
        skill_statuses: [{ name: 'fail-no-err', status: 'failed' }],
      }),
    ];
    render(<SkillStatusPanel agents={agents} />);
    expect(screen.queryByTestId('skill-error-toggle-fail-no-err')).toBeNull();
  });
});

// ============================================================
// Integration: uses mockWorkerAgent from mocks
// ============================================================

describe('SkillStatusPanel with mock data', () => {
  it('renders worker agent skills from mockWorkerAgent', () => {
    render(<SkillStatusPanel agents={[mockWorkerAgent]} />);
    expect(screen.getByTestId('skill-status-panel')).toBeTruthy();
    expect(screen.getByTestId('agent-skills-worker-agent')).toBeTruthy();
    expect(screen.getByTestId('skill-item-https://github.com/anthropic/tools:read')).toBeTruthy();
    expect(screen.getByTestId('skill-item-https://github.com/anthropic/tools:bash')).toBeTruthy();
  });
});
