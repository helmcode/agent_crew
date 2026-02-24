import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TeamMonitorPage } from './TeamMonitorPage';
import { mockRunningTeam, mockTaskLog, mockWorkerAgent, mockActivityEventLog } from '../test/mocks';

let wsOnMessage: ((log: unknown) => void) | null = null;
let wsOnStateChange: ((state: string) => void) | null = null;

vi.mock('../services/websocket', () => ({
  connectTeamActivity: (_teamId: string, opts: { onMessage: (log: unknown) => void; onStateChange?: (state: string) => void }) => {
    wsOnMessage = opts.onMessage;
    wsOnStateChange = opts.onStateChange ?? null;
    return vi.fn();
  },
}));

function mockFetch(messagesBody: unknown[] = [], activityBody: unknown[] = []) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/activity')) {
      return new Response(JSON.stringify(activityBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/messages')) {
      return new Response(JSON.stringify(messagesBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/chat')) {
      return new Response(JSON.stringify({ status: 'queued', message: 'Message queued' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/teams/')) {
      return new Response(JSON.stringify(mockRunningTeam), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

// User-to-agent message
const userToAgentMsg = {
  ...mockTaskLog,
  id: 'log-user-agent-1',
  from_agent: 'user',
  to_agent: 'leader',
  message_type: 'user_message',
  payload: { content: 'Start the deployment' },
};

// Tool-call logs that only appear in the activity feed (not chat panel)
const toolLog1 = {
  ...mockTaskLog,
  id: 'log-tool-1',
  from_agent: 'agent-alpha',
  message_type: 'tool_call',
  payload: { content: 'Running lint check' },
};

const toolLog2 = {
  ...mockTaskLog,
  id: 'log-tool-2',
  from_agent: 'agent-beta',
  message_type: 'tool_result',
  payload: { content: 'Lint passed' },
};

beforeEach(() => {
  vi.restoreAllMocks();
  wsOnMessage = null;
  wsOnStateChange = null;
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teams/team-uuid-2']}>
      <Routes>
        <Route path="/teams/:id" element={<TeamMonitorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeamMonitorPage', () => {
  it('shows loading spinner initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders team info after loading', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });
  });

  it('renders agent count badge in header', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('agent-count-badge')).toBeInTheDocument();
      expect(screen.getByTestId('agent-count-badge').textContent).toContain('2 agents');
    });
  });

  it('displays activity messages received via WebSocket', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.(toolLog1);
    });

    await waitFor(() => {
      expect(screen.getByText('Running lint check')).toBeInTheDocument();
    });
  });

  it('shows "No activity yet" when no messages', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No activity yet')).toBeInTheDocument();
    });
  });

  it('renders initial messages from API', async () => {
    global.fetch = mockFetch([], [toolLog1]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Running lint check')).toBeInTheDocument();
    });
  });

  it('updates connection state indicator', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    act(() => {
      wsOnStateChange?.('connected');
    });

    await waitFor(() => {
      expect(screen.getByText('connected')).toBeInTheDocument();
    });
  });

  it('filters messages by agent via filter popover', async () => {
    global.fetch = mockFetch([], [toolLog1, toolLog2]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Running lint check')).toBeInTheDocument();
      expect(screen.getByText('Lint passed')).toBeInTheDocument();
    });

    // Open filter popover
    await userEvent.click(screen.getByTestId('activity-filter-button'));

    await waitFor(() => {
      expect(screen.getByTestId('activity-filter-popover')).toBeInTheDocument();
    });

    const selects = within(screen.getByTestId('activity-filter-popover')).getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], 'agent-alpha');

    expect(screen.getByText('Running lint check')).toBeInTheDocument();
    expect(screen.queryByText('Lint passed')).not.toBeInTheDocument();
  });

  it('filters messages by type via filter popover', async () => {
    global.fetch = mockFetch([], [toolLog1, toolLog2]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Running lint check')).toBeInTheDocument();
      expect(screen.getByText('Lint passed')).toBeInTheDocument();
    });

    // Open filter popover
    await userEvent.click(screen.getByTestId('activity-filter-button'));

    await waitFor(() => {
      expect(screen.getByTestId('activity-filter-popover')).toBeInTheDocument();
    });

    const selects = within(screen.getByTestId('activity-filter-popover')).getAllByRole('combobox');
    await userEvent.selectOptions(selects[1], 'tool_result');

    expect(screen.queryByText('Running lint check')).not.toBeInTheDocument();
    expect(screen.getByText('Lint passed')).toBeInTheDocument();
  });

  it('shows chat input when team is running', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });
  });

  it('sends a chat message', async () => {
    const fetchMock = mockFetch();
    global.fetch = fetchMock;

    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Hello team');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      const chatCall = fetchMock.mock.calls.find(
        (call) => {
          const url = typeof call[0] === 'string' ? call[0] : '';
          return url.includes('/chat') && call[1]?.method === 'POST';
        },
      );
      expect(chatCall).toBeTruthy();
    });
  });

  it('extracts readable text from nested NATS task_result payload', async () => {
    const nestedMsg = {
      ...mockTaskLog,
      id: 'log-nested-1',
      from_agent: 'lead',
      to_agent: 'user',
      message_type: 'task_result',
      payload: {
        message_id: 'nats-123',
        from: 'lead',
        to: 'team.dev.leader',
        type: 'task_result',
        payload: { status: 'completed', result: 'Here is the analysis you requested.' },
        timestamp: '2026-01-01T00:00:01Z',
      },
    };

    global.fetch = mockFetch([nestedMsg], [nestedMsg]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Here is the analysis you requested.')).toBeInTheDocument();
    });
    // The chat bubble (<p>) should show the extracted text, not raw JSON.
    // The activity panel (<pre>) may legitimately show the full envelope.
    const chatBubble = screen.getByText('Here is the analysis you requested.');
    expect(chatBubble.tagName).toBe('P');
  });

  it('shows friendly status when task_result has empty result', async () => {
    const emptyResultMsg = {
      ...mockTaskLog,
      id: 'log-empty-1',
      from_agent: 'lead',
      to_agent: 'user',
      message_type: 'task_result',
      payload: {
        message_id: 'nats-456',
        from: 'lead',
        to: 'team.dev.leader',
        type: 'task_result',
        payload: { status: 'completed', result: '' },
        timestamp: '2026-01-01T00:00:02Z',
      },
    };

    global.fetch = mockFetch([emptyResultMsg], [emptyResultMsg]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Task completed.')).toBeInTheDocument();
    });
    // Friendly text should appear in a chat bubble (<p>), not raw JSON
    const chatBubble = screen.getByText('Task completed.');
    expect(chatBubble.tagName).toBe('P');
  });

  it('extracts content from nested NATS agent_response payload', async () => {
    const nestedResponse = {
      ...mockTaskLog,
      id: 'log-resp-1',
      from_agent: 'lead',
      to_agent: 'user',
      message_type: 'agent_response',
      payload: {
        message_id: 'nats-789',
        from: 'lead',
        to: 'user',
        type: 'agent_response',
        payload: { content: 'I have finished the refactoring.' },
        timestamp: '2026-01-01T00:00:03Z',
      },
    };

    global.fetch = mockFetch([nestedResponse], [nestedResponse]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('I have finished the refactoring.')).toBeInTheDocument();
    });
    const chatBubble = screen.getByText('I have finished the refactoring.');
    expect(chatBubble.tagName).toBe('P');
  });

  // --- Thinking indicator tests ---

  it('shows thinking indicator after sending a message', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Hello');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });
  });

  it('hides thinking indicator when agent_response arrives', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Hello');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.({
        ...mockTaskLog,
        id: 'agent-reply-1',
        from_agent: 'lead',
        to_agent: 'user',
        message_type: 'agent_response',
        payload: { content: 'Here is my reply.' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    });
  });

  it('hides thinking indicator when task_result arrives', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Run task');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.({
        ...mockTaskLog,
        id: 'task-result-1',
        from_agent: 'lead',
        to_agent: 'user',
        message_type: 'task_result',
        payload: { result: 'Task done.' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    });
  });

  it('hides thinking indicator when error arrives from agent', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Break things');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.({
        ...mockTaskLog,
        id: 'error-1',
        from_agent: 'lead',
        to_agent: 'user',
        message_type: 'error',
        payload: { content: 'Something went wrong' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    });
  });

  it('does not hide thinking indicator on error from user', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Test');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.({
        ...mockTaskLog,
        id: 'error-user-1',
        from_agent: 'user',
        message_type: 'error',
        payload: { content: 'User-side error' },
      });
    });

    // Indicator should still be visible because from_agent === 'user'
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('does not show thinking indicator when send fails', async () => {
    const failFetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/chat')) {
        return new Response(JSON.stringify({ error: 'Server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/activity')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/messages')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/teams/')) {
        return new Response(JSON.stringify(mockRunningTeam), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = failFetch;

    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Fail msg');
    await userEvent.click(screen.getByText('Send'));

    // After failed send, the thinking indicator should not remain
    await waitFor(() => {
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    });
  });

  // --- Optimistic message tests ---

  it('shows optimistic message immediately before API response', async () => {
    // Use a fetch that delays chat response
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/chat')) {
        await new Promise((r) => setTimeout(r, 100));
        return new Response(JSON.stringify({ status: 'queued' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/activity')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/messages')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/teams/')) {
        return new Response(JSON.stringify(mockRunningTeam), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Optimistic hello');
    await userEvent.click(screen.getByText('Send'));

    // Message should appear immediately (optimistic) — may appear in both chat and activity panels
    await waitFor(() => {
      expect(screen.getAllByText('Optimistic hello').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('replaces optimistic message with real WebSocket message', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Replace me');
    await userEvent.click(screen.getByText('Send'));

    const chatPanel = screen.getByTestId('chat-messages');
    await waitFor(() => {
      expect(within(chatPanel).getAllByText('Replace me').length).toBeGreaterThanOrEqual(1);
    });

    const beforeCount = within(chatPanel).getAllByText('Replace me').length;

    // Simulate the real message arriving via WebSocket — should replace the optimistic one
    act(() => {
      wsOnMessage?.({
        ...mockTaskLog,
        id: 'real-msg-1',
        from_agent: 'user',
        to_agent: 'leader',
        message_type: 'user_message',
        payload: { content: 'Replace me' },
      });
    });

    // Count in chat panel should not increase (optimistic was replaced, not duplicated)
    await waitFor(() => {
      const afterCount = within(chatPanel).getAllByText('Replace me').length;
      expect(afterCount).toBeLessThanOrEqual(beforeCount);
    });
  });

  it('deduplicates messages with the same ID', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    const msg = {
      ...mockTaskLog,
      id: 'dedup-1',
      from_agent: 'lead',
      message_type: 'agent_response',
      payload: { content: 'Unique message' },
    };

    act(() => {
      wsOnMessage?.(msg);
      wsOnMessage?.(msg); // duplicate
    });

    await waitFor(() => {
      const matches = screen.getAllByText('Unique message');
      // Should appear in chat and activity, but each only once
      expect(matches.length).toBeLessThanOrEqual(2);
    });
  });

  it('renders error messages with error styling', async () => {
    const errorMsg = {
      ...mockTaskLog,
      id: 'err-styled-1',
      from_agent: 'lead',
      to_agent: 'user',
      message_type: 'error',
      payload: { content: 'API key is invalid' },
    };

    global.fetch = mockFetch([errorMsg], [errorMsg]);
    renderPage();

    await waitFor(() => {
      // Error label in chat panel
      expect(screen.getAllByText('Error').length).toBeGreaterThanOrEqual(1);
      // Error text appears in chat and possibly activity
      expect(screen.getAllByText('API key is invalid').length).toBeGreaterThanOrEqual(1);
    });

    // Verify the error styling is applied (red border container exists in chat)
    const errorContainer = document.querySelector('.border-red-500\\/30');
    expect(errorContainer).toBeTruthy();
  });

  it('shows empty chat placeholder when no chat messages', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Send a message to the team')).toBeInTheDocument();
    });
  });

  it('clears input after successful send', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    const input = screen.getByPlaceholderText('Send a message...');
    await userEvent.type(input, 'Clear me');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  // --- Single-leader architecture: agents panel tests ---

  it('shows agent info icon and tooltip on hover', async () => {
    global.fetch = mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('agent-count-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('agent-info-icon')).toBeInTheDocument();
    // Tooltip not visible initially
    expect(screen.queryByTestId('agent-tooltip')).not.toBeInTheDocument();
  });

  it('shows agent details in tooltip on hover', async () => {
    global.fetch = mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('agent-count-badge')).toBeInTheDocument();
    });

    // Hover over the agent count area to show tooltip
    await userEvent.hover(screen.getByTestId('agent-count-badge'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-tooltip')).toBeInTheDocument();
      expect(screen.getByText('test-agent')).toBeInTheDocument();
      expect(screen.getByText('worker-agent')).toBeInTheDocument();
    });
  });

  it('does not render inter-agent badge in activity feed', async () => {
    const agentToAgentMsg = {
      ...mockTaskLog,
      id: 'log-a2a-1',
      from_agent: 'leader',
      to_agent: 'worker-1',
      message_type: 'tool_call',
      payload: { content: 'Calling tool' },
    };

    global.fetch = mockFetch([], [agentToAgentMsg]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Calling tool')).toBeInTheDocument();
    });

    // No inter-agent badge should exist in the new architecture
    expect(screen.queryByTestId('inter-agent-badge')).not.toBeInTheDocument();
  });

  // --- Tools button tests ---

  it('shows tools button with green color when all skills installed', async () => {
    global.fetch = mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('tools-button')).toBeInTheDocument();
    });

    // Worker agent mock has all skills installed
    const btn = screen.getByTestId('tools-button');
    expect(btn.className).toContain('text-green-400');
  });

  it('shows tools button with red color when skills failed', async () => {
    const teamWithFailed = {
      ...mockRunningTeam,
      agents: [
        { ...mockRunningTeam.agents![0] },
        {
          ...mockWorkerAgent,
          id: 'agent-uuid-2',
          skill_statuses: [
            { name: '@anthropic/tool-read', status: 'installed' },
            { name: 'bad-skill', status: 'failed', error: 'Not found' },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/activity')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/messages')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/api/teams/')) return new Response(JSON.stringify(teamWithFailed), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderPage();

    await waitFor(() => {
      const btn = screen.getByTestId('tools-button');
      expect(btn.className).toContain('text-red-400');
    });
  });

  it('shows tools button with yellow color when skills pending', async () => {
    const teamWithPending = {
      ...mockRunningTeam,
      agents: [
        { ...mockRunningTeam.agents![0] },
        {
          ...mockWorkerAgent,
          id: 'agent-uuid-2',
          skill_statuses: [
            { name: '@anthropic/tool-read', status: 'installed' },
            { name: '@anthropic/tool-bash', status: 'pending' },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/activity')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/messages')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/api/teams/')) return new Response(JSON.stringify(teamWithPending), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderPage();

    await waitFor(() => {
      const btn = screen.getByTestId('tools-button');
      expect(btn.className).toContain('text-yellow-400');
    });
  });

  it('opens tools modal when tools button is clicked', async () => {
    global.fetch = mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('tools-button')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('tools-button'));

    await waitFor(() => {
      expect(screen.getByTestId('tools-modal')).toBeInTheDocument();
      expect(screen.getByText('Install New Skill')).toBeInTheDocument();
    });
  });

  // --- Live activity feed tests ---

  it('shows live activity feed in chat panel when activity_event arrives', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.(mockActivityEventLog);
    });

    await waitFor(() => {
      expect(screen.getByTestId('live-activity-feed')).toBeInTheDocument();
      expect(screen.getByTestId('live-activity-item')).toBeInTheDocument();
    });
  });

  it('clears live activity feed when agent_response arrives', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.(mockActivityEventLog);
    });

    await waitFor(() => {
      expect(screen.getByTestId('live-activity-feed')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage?.({
        ...mockTaskLog,
        id: 'reply-1',
        from_agent: 'lead',
        to_agent: 'user',
        message_type: 'agent_response',
        payload: { content: 'Done!' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('live-activity-feed')).not.toBeInTheDocument();
    });
  });

  it('renders activity_event with ActivityEventCard in sidebar', async () => {
    global.fetch = mockFetch([], [mockActivityEventLog]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('activity-event-card')).toBeInTheDocument();
    });
  });

  it('renders activity messages with uniform styling (no purple borders)', async () => {
    const msg = {
      ...mockTaskLog,
      id: 'log-uniform-1',
      from_agent: 'leader',
      to_agent: 'user',
      message_type: 'agent_response',
      payload: { content: 'Uniform style message' },
    };

    global.fetch = mockFetch([], [msg]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Uniform style message')).toBeInTheDocument();
    });

    // No purple border styling should be present
    const container = screen.getByText('Uniform style message').closest('.mb-2');
    expect(container?.classList.contains('border-l-2')).toBeFalsy();
    expect(container?.classList.contains('border-purple-500/50')).toBeFalsy();
  });

  // --- Live activity events cap ---

  it('caps live activity events at 50', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    // Send 55 activity events
    act(() => {
      for (let i = 0; i < 55; i++) {
        wsOnMessage?.({
          ...mockActivityEventLog,
          id: `activity-cap-${i}`,
        });
      }
    });

    await waitFor(() => {
      const items = screen.getAllByTestId('live-activity-item');
      expect(items).toHaveLength(50);
    });
  });

  // --- Chat input validation ---

  it('shows red border on empty message submit', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.click(screen.getByText('Send'));

    const input = screen.getByPlaceholderText('Send a message...');
    expect(input).toHaveClass('border-red-500');
  });

  it('sends message via Enter key', async () => {
    const fetchMock = mockFetch();
    global.fetch = fetchMock;
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Enter key test{Enter}');

    await waitFor(() => {
      const chatCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.includes('/chat') && call[1]?.method === 'POST';
      });
      expect(chatCall).toBeTruthy();
    });
  });

  // --- Error "Go to Settings" navigation ---

  it('navigates to settings when "Go to Settings" is clicked', async () => {
    const errorMsg = {
      ...mockTaskLog,
      id: 'err-settings-1',
      from_agent: 'lead',
      to_agent: 'user',
      message_type: 'error',
      payload: { content: 'API key is invalid' },
    };

    global.fetch = mockFetch([errorMsg], [errorMsg]);

    render(
      <MemoryRouter initialEntries={['/teams/team-uuid-2']}>
        <Routes>
          <Route path="/teams/:id" element={<TeamMonitorPage />} />
          <Route path="/settings" element={<div data-testid="settings-page">Settings</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Go to Settings'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-page')).toBeInTheDocument();
    });
  });

  // --- Stopped team disables chat ---

  // --- Chat auto-scroll tests ---

  it('auto-scroll triggers on liveActivityEvents change', async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    scrollIntoViewMock.mockClear();

    act(() => {
      wsOnMessage?.(mockActivityEventLog);
    });

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('auto-scroll triggers on waitingForReply change', async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).not.toBeDisabled();
    });

    scrollIntoViewMock.mockClear();

    await userEvent.type(screen.getByPlaceholderText('Send a message...'), 'Trigger scroll');
    await userEvent.click(screen.getByText('Send'));

    // Sending sets waitingForReply=true, which should trigger auto-scroll
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('auto-scroll uses requestAnimationFrame', async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const originalRAF = globalThis.requestAnimationFrame;
    const rafMock = vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    globalThis.requestAnimationFrame = rafMock;

    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });

    rafMock.mockClear();
    scrollIntoViewMock.mockClear();

    act(() => {
      wsOnMessage?.({
        ...mockTaskLog,
        id: 'raf-test-1',
        from_agent: 'lead',
        to_agent: 'user',
        message_type: 'agent_response',
        payload: { content: 'RAF test message' },
      });
    });

    await waitFor(() => {
      expect(rafMock).toHaveBeenCalled();
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    globalThis.requestAnimationFrame = originalRAF;
  });

  it('disables chat input and send button when team is stopped', async () => {
    const stoppedTeam = { ...mockRunningTeam, status: 'stopped' as const };
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/activity')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/messages')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/api/teams/')) return new Response(JSON.stringify(stoppedTeam), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Send a message...')).toBeDisabled();
    });
    expect(screen.getByText('Send')).toBeDisabled();
  });
});
