import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  extractActivityEvent,
  relativeTime,
  extractContentItems,
  classifyActivityEvent,
  ActivityEventCard,
  LiveActivityFeed,
} from './ActivityPanel';
import type { TaskLog, ActivityEvent } from '../types';

const baseLog: TaskLog = {
  id: 'log-1',
  team_id: 'team-1',
  message_id: 'msg-1',
  from_agent: 'backend-dev',
  to_agent: 'leader',
  message_type: 'activity_event',
  payload: {
    event_type: 'tool_use',
    agent_name: 'backend-dev',
    tool_name: 'Bash',
    action: 'npm test',
    payload: { exit_code: 0 },
    timestamp: '2026-01-15T10:00:00Z',
  },
  created_at: '2026-01-15T10:00:00Z',
};

function makeActivityLog(overrides: Partial<TaskLog> & { eventOverrides?: Record<string, unknown> }): TaskLog {
  const { eventOverrides, ...logOverrides } = overrides;
  const basePayload = baseLog.payload as Record<string, unknown>;
  return {
    ...baseLog,
    ...logOverrides,
    payload: { ...basePayload, ...eventOverrides },
  };
}

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    event_type: 'assistant',
    agent_name: 'test-agent',
    timestamp: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('extractActivityEvent', () => {
  it('extracts event from flat payload', () => {
    const event = extractActivityEvent(baseLog);
    expect(event).not.toBeNull();
    expect(event!.event_type).toBe('tool_use');
    expect(event!.agent_name).toBe('backend-dev');
    expect(event!.tool_name).toBe('Bash');
    expect(event!.action).toBe('npm test');
  });

  it('extracts event from NATS envelope (nested payload.payload)', () => {
    const nestedLog: TaskLog = {
      ...baseLog,
      payload: {
        message_id: 'nats-1',
        from: 'backend-dev',
        to: 'team.activity',
        type: 'activity_event',
        payload: {
          event_type: 'assistant',
          agent_name: 'frontend-dev',
          action: 'Analyzing component structure',
          timestamp: '2026-01-15T10:01:00Z',
        },
        timestamp: '2026-01-15T10:01:00Z',
      },
    };

    const event = extractActivityEvent(nestedLog);
    expect(event).not.toBeNull();
    expect(event!.event_type).toBe('assistant');
    expect(event!.agent_name).toBe('frontend-dev');
    expect(event!.action).toBe('Analyzing component structure');
  });

  it('returns null for non-activity_event messages', () => {
    const chatLog: TaskLog = { ...baseLog, message_type: 'user_message' };
    expect(extractActivityEvent(chatLog)).toBeNull();
  });

  it('returns null for null payload', () => {
    const nullLog: TaskLog = { ...baseLog, payload: null as unknown };
    expect(extractActivityEvent(nullLog)).toBeNull();
  });

  it('returns null for invalid event_type', () => {
    const invalidLog = makeActivityLog({ eventOverrides: { event_type: 'unknown_type' } });
    expect(extractActivityEvent(invalidLog)).toBeNull();
  });

  it('falls back to log.from_agent when agent_name is missing', () => {
    const log = makeActivityLog({ eventOverrides: { agent_name: undefined } });
    const event = extractActivityEvent(log);
    expect(event!.agent_name).toBe('backend-dev');
  });

  it('falls back to log.created_at when timestamp is missing', () => {
    const log = makeActivityLog({ eventOverrides: { timestamp: undefined } });
    const event = extractActivityEvent(log);
    expect(event!.timestamp).toBe(baseLog.created_at);
  });
});

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:05:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps < 5s ago', () => {
    expect(relativeTime('2026-01-15T10:04:57Z')).toBe('just now');
  });

  it('returns seconds for timestamps < 60s ago', () => {
    expect(relativeTime('2026-01-15T10:04:30Z')).toBe('30s ago');
  });

  it('returns minutes for timestamps < 60m ago', () => {
    expect(relativeTime('2026-01-15T10:00:00Z')).toBe('5m ago');
  });

  it('returns hours for timestamps < 24h ago', () => {
    expect(relativeTime('2026-01-15T08:05:00Z')).toBe('2h ago');
  });

  it('returns days for timestamps >= 24h ago', () => {
    expect(relativeTime('2026-01-13T10:05:00Z')).toBe('2d ago');
  });

  it('returns "just now" for future timestamps', () => {
    expect(relativeTime('2026-01-15T10:06:00Z')).toBe('just now');
  });
});

describe('extractContentItems', () => {
  it('extracts from message.content[] pattern', () => {
    const payload = {
      message: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    };
    const items = extractContentItems(payload);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('text');
    expect(items[1].name).toBe('Bash');
  });

  it('extracts from direct content[] pattern', () => {
    const payload = {
      content: [{ type: 'thinking', text: 'analyzing...' }],
    };
    const items = extractContentItems(payload);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('thinking');
  });

  it('returns empty array for null payload', () => {
    expect(extractContentItems(null)).toEqual([]);
  });

  it('returns empty array for non-object payload', () => {
    expect(extractContentItems('string')).toEqual([]);
  });

  it('returns empty array for payload without content', () => {
    expect(extractContentItems({ foo: 'bar' })).toEqual([]);
  });
});

describe('classifyActivityEvent', () => {
  it('classifies error events as error', () => {
    expect(classifyActivityEvent(makeEvent({ event_type: 'error' }))).toBe('error');
  });

  it('classifies tool_result events as tool_result', () => {
    expect(classifyActivityEvent(makeEvent({ event_type: 'tool_result' }))).toBe('tool_result');
  });

  it('classifies tool_use with Task as delegation', () => {
    expect(classifyActivityEvent(makeEvent({ event_type: 'tool_use', tool_name: 'Task' }))).toBe('delegation');
  });

  it('classifies tool_use with other tool as tool', () => {
    expect(classifyActivityEvent(makeEvent({ event_type: 'tool_use', tool_name: 'Bash' }))).toBe('tool');
  });

  it('classifies tool_use without tool_name as tool', () => {
    expect(classifyActivityEvent(makeEvent({ event_type: 'tool_use' }))).toBe('tool');
  });

  it('classifies assistant with Task content item as delegation', () => {
    const event = makeEvent({
      payload: {
        message: {
          content: [
            { type: 'tool_use', name: 'Task', input: { description: 'do stuff', subagent_type: 'backend' } },
          ],
        },
      },
    });
    expect(classifyActivityEvent(event)).toBe('delegation');
  });

  it('classifies assistant with non-Task tool_use as tool', () => {
    const event = makeEvent({
      payload: {
        message: {
          content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/test.ts' } }],
        },
      },
    });
    expect(classifyActivityEvent(event)).toBe('tool');
  });

  it('classifies assistant with thinking content as thinking', () => {
    const event = makeEvent({
      payload: {
        message: {
          content: [{ type: 'thinking', text: 'analyzing the problem...' }],
        },
      },
    });
    expect(classifyActivityEvent(event)).toBe('thinking');
  });

  it('classifies assistant with text content as text', () => {
    const event = makeEvent({
      payload: {
        message: {
          content: [{ type: 'text', text: 'Here is my response' }],
        },
      },
    });
    expect(classifyActivityEvent(event)).toBe('text');
  });

  it('classifies assistant without content items as text', () => {
    expect(classifyActivityEvent(makeEvent())).toBe('text');
  });

  it('prioritizes Task tool_use over thinking in mixed content', () => {
    const event = makeEvent({
      payload: {
        message: {
          content: [
            { type: 'thinking', text: 'let me think...' },
            { type: 'tool_use', name: 'Task', input: { description: 'deploy' } },
          ],
        },
      },
    });
    expect(classifyActivityEvent(event)).toBe('delegation');
  });

  it('prioritizes tool_use over thinking in mixed content', () => {
    const event = makeEvent({
      payload: {
        message: {
          content: [
            { type: 'thinking', text: 'let me think...' },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      },
    });
    expect(classifyActivityEvent(event)).toBe('tool');
  });
});

describe('ActivityEventCard', () => {
  it('renders tool event with tool icon and summary', () => {
    render(<ActivityEventCard log={baseLog} />);
    expect(screen.getByTestId('icon-tool')).toBeInTheDocument();
    expect(screen.getByText('tool')).toBeInTheDocument();
    expect(screen.getByText('backend-dev')).toBeInTheDocument();
    expect(screen.getByText('Bash: npm test')).toBeInTheDocument();
  });

  it('renders delegation event for Task tool_use', () => {
    const log = makeActivityLog({
      eventOverrides: { tool_name: 'Task', action: 'Refactor backend' },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-delegation')).toBeInTheDocument();
    expect(screen.getByText('delegation')).toBeInTheDocument();
    expect(screen.getByText(/Delegated.*Refactor backend/)).toBeInTheDocument();
  });

  it('renders delegation from assistant with Task content item', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Task',
                input: { description: 'Fix auth', subagent_type: 'backend' },
              },
            ],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-delegation')).toBeInTheDocument();
    expect(screen.getByText('delegation')).toBeInTheDocument();
    expect(screen.getByText(/Delegated.*backend.*Fix auth/)).toBeInTheDocument();
  });

  it('renders tool from assistant with non-Task tool_use content', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [
              { type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.ts' } },
            ],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-tool')).toBeInTheDocument();
    expect(screen.getByText('tool')).toBeInTheDocument();
    expect(screen.getByText('Edit: /src/app.ts')).toBeInTheDocument();
  });

  it('renders thinking event with muted styling', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [{ type: 'thinking', text: 'Let me analyze this problem carefully' }],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-thinking')).toBeInTheDocument();
    expect(screen.getByText('thinking')).toBeInTheDocument();
    expect(screen.getByText('Let me analyze this problem carefully')).toBeInTheDocument();
    // Verify muted styling (opacity)
    const card = screen.getByTestId('activity-event-card');
    expect(card.className).toContain('opacity-60');
  });

  it('renders text event for assistant without content items', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'assistant', action: 'Analyzing the code', tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-text')).toBeInTheDocument();
    expect(screen.getByText('message')).toBeInTheDocument();
    expect(screen.getByText('Analyzing the code')).toBeInTheDocument();
  });

  it('renders tool_result event with check icon', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'tool_result', tool_name: 'Read' },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-tool-result')).toBeInTheDocument();
    expect(screen.getByText('Read result')).toBeInTheDocument();
  });

  it('renders error event with error icon', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'error', action: 'File not found', tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-error')).toBeInTheDocument();
    expect(screen.getByText('File not found')).toBeInTheDocument();
  });

  it('shows collapsible payload section', async () => {
    render(<ActivityEventCard log={baseLog} />);
    expect(screen.queryByTestId('event-payload')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Show details'));
    expect(screen.getByTestId('event-payload')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Hide details'));
    expect(screen.queryByTestId('event-payload')).not.toBeInTheDocument();
  });

  it('does not show details button when no payload', () => {
    const log = makeActivityLog({ eventOverrides: { payload: undefined } });
    render(<ActivityEventCard log={log} />);
    expect(screen.queryByText('Show details')).not.toBeInTheDocument();
  });

  it('returns null for non-activity_event messages', () => {
    const chatLog: TaskLog = { ...baseLog, message_type: 'user_message' };
    const { container } = render(<ActivityEventCard log={chatLog} />);
    expect(container.innerHTML).toBe('');
  });

  it('filters signature fields from payload display', async () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [
              { type: 'thinking', text: 'analyzing...', signature: 'abc123secret' },
            ],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    await userEvent.click(screen.getByText('Show details'));
    const payload = screen.getByTestId('event-payload');
    expect(payload.textContent).not.toContain('abc123secret');
    expect(payload.textContent).not.toContain('signature');
  });

  it('shows tool context for Bash command in content items', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [
              { type: 'tool_use', name: 'Bash', input: { command: 'npm run build' } },
            ],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Bash: npm run build')).toBeInTheDocument();
  });

  it('shows tool context for Grep pattern in content items', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [
              { type: 'tool_use', name: 'Grep', input: { pattern: 'TODO' } },
            ],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Grep: TODO')).toBeInTheDocument();
  });

  it('truncates long thinking text at 100 chars', () => {
    const longText = 'A'.repeat(200);
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [{ type: 'thinking', text: longText }],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    const summary = screen.getByText(/^A+\.\.\.$/);
    expect(summary.textContent!.length).toBe(103); // 100 + '...'
  });
});

describe('LiveActivityFeed', () => {
  it('renders nothing when events array is empty', () => {
    const { container } = render(<LiveActivityFeed events={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders compact items for activity events', () => {
    const events = [
      baseLog,
      makeActivityLog({
        id: 'log-2',
        eventOverrides: { event_type: 'assistant', action: 'Reviewing changes', tool_name: undefined },
      }),
    ];

    render(<LiveActivityFeed events={events} />);
    expect(screen.getByTestId('live-activity-feed')).toBeInTheDocument();
    expect(screen.getAllByTestId('live-activity-item')).toHaveLength(2);
  });

  it('shows truncated summary text', () => {
    render(<LiveActivityFeed events={[baseLog]} />);
    expect(screen.getByText('Bash: npm test')).toBeInTheDocument();
  });

  it('skips non-activity_event logs', () => {
    const events = [
      baseLog,
      { ...baseLog, id: 'log-chat', message_type: 'user_message' } as TaskLog,
    ];
    render(<LiveActivityFeed events={events} />);
    expect(screen.getAllByTestId('live-activity-item')).toHaveLength(1);
  });

  it('applies muted styling for thinking events', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [{ type: 'thinking', text: 'pondering...' }],
          },
        },
      },
    });
    render(<LiveActivityFeed events={[log]} />);
    const item = screen.getByTestId('live-activity-item');
    expect(item.className).toContain('opacity-60');
  });
});

describe('getCategorySummary edge cases (via components)', () => {
  it('shows "Assistant message" for text event without action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'assistant', action: undefined, tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Assistant message')).toBeInTheDocument();
  });

  it('shows "Assistant message" for text event with empty string action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'assistant', action: '', tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Assistant message')).toBeInTheDocument();
  });

  it('shows action text for tool event without tool_name', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'tool_use', tool_name: undefined, action: 'running tests' },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('running tests')).toBeInTheDocument();
  });

  it('shows "Tool call" for tool event without tool_name and action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'tool_use', tool_name: undefined, action: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Tool call')).toBeInTheDocument();
  });

  it('shows "Error occurred" for error event without action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'error', action: undefined, tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('shows "Error occurred" for error event with empty action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'error', action: '', tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('shows "Tool result" for tool_result without tool_name', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'tool_result', tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Tool result')).toBeInTheDocument();
  });

  it('shows "Delegated task" for Task tool_use without action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'tool_use', tool_name: 'Task', action: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Delegated task')).toBeInTheDocument();
  });

  it('shows "Thinking..." for thinking event without text', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [{ type: 'thinking' }],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('shows text from content item for text category', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [{ type: 'text', text: 'Here is my analysis' }],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Here is my analysis')).toBeInTheDocument();
  });

  it('shows delegation summary with subagent_type and description', () => {
    const log = makeActivityLog({
      eventOverrides: {
        event_type: 'assistant',
        tool_name: undefined,
        action: undefined,
        payload: {
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Task',
                input: { subagent_type: 'Explore', description: 'Search codebase' },
              },
            ],
          },
        },
      },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText(/Delegated.*Explore.*Search codebase/)).toBeInTheDocument();
  });
});
