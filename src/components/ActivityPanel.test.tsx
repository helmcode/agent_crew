import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { extractActivityEvent, relativeTime, ActivityEventCard, LiveActivityFeed } from './ActivityPanel';
import type { TaskLog } from '../types';

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

describe('ActivityEventCard', () => {
  it('renders tool_use event with tool icon and summary', () => {
    render(<ActivityEventCard log={baseLog} />);
    expect(screen.getByTestId('icon-tool-use')).toBeInTheDocument();
    expect(screen.getByText('tool_use')).toBeInTheDocument();
    expect(screen.getByText('backend-dev')).toBeInTheDocument();
    expect(screen.getByText('Bash: npm test')).toBeInTheDocument();
  });

  it('renders assistant event with thinking icon', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'assistant', action: 'Analyzing the code', tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByTestId('icon-assistant')).toBeInTheDocument();
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

  it('truncates long assistant action text', () => {
    const longAction = 'A'.repeat(200);
    const log = makeActivityLog({
      eventOverrides: { event_type: 'assistant', action: longAction, tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    const summary = screen.getByText(/^A+\.\.\.$/);
    expect(summary.textContent!.length).toBeLessThan(200);
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
});

describe('getEventSummary edge cases (via components)', () => {
  it('shows "Thinking..." for assistant event without action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'assistant', action: undefined, tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('shows "Thinking..." for assistant event with empty string action', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'assistant', action: '', tool_name: undefined },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('shows action text for tool_use without tool_name', () => {
    const log = makeActivityLog({
      eventOverrides: { event_type: 'tool_use', tool_name: undefined, action: 'running tests' },
    });
    render(<ActivityEventCard log={log} />);
    expect(screen.getByText('running tests')).toBeInTheDocument();
  });

  it('shows "Tool call" for tool_use without tool_name and action', () => {
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
});
