import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TeamMonitorPage } from './TeamMonitorPage';
import { mockRunningTeam, mockTaskLog } from '../test/mocks';

let wsOnMessage: ((log: unknown) => void) | null = null;
let wsOnStateChange: ((state: string) => void) | null = null;

vi.mock('../services/websocket', () => ({
  connectTeamActivity: (_teamId: string, opts: { onMessage: (log: unknown) => void; onStateChange?: (state: string) => void }) => {
    wsOnMessage = opts.onMessage;
    wsOnStateChange = opts.onStateChange ?? null;
    return vi.fn();
  },
}));

function mockFetch(messagesBody: unknown[] = []) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

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

  it('renders agent list in left panel', async () => {
    global.fetch = mockFetch();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('test-agent')).toBeInTheDocument();
      expect(screen.getByText('worker-agent')).toBeInTheDocument();
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
    global.fetch = mockFetch([toolLog1]);
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

  it('filters messages by agent', async () => {
    global.fetch = mockFetch([toolLog1, toolLog2]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Running lint check')).toBeInTheDocument();
      expect(screen.getByText('Lint passed')).toBeInTheDocument();
    });

    const agentFilter = screen.getAllByRole('combobox')[0];
    await userEvent.selectOptions(agentFilter, 'agent-alpha');

    expect(screen.getByText('Running lint check')).toBeInTheDocument();
    expect(screen.queryByText('Lint passed')).not.toBeInTheDocument();
  });

  it('filters messages by type', async () => {
    global.fetch = mockFetch([toolLog1, toolLog2]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Running lint check')).toBeInTheDocument();
      expect(screen.getByText('Lint passed')).toBeInTheDocument();
    });

    const typeFilter = screen.getAllByRole('combobox')[1];
    await userEvent.selectOptions(typeFilter, 'tool_result');

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

    global.fetch = mockFetch([nestedMsg]);
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

    global.fetch = mockFetch([emptyResultMsg]);
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

    global.fetch = mockFetch([nestedResponse]);
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

    await waitFor(() => {
      expect(screen.getAllByText('Replace me').length).toBeGreaterThanOrEqual(1);
    });

    const beforeCount = screen.getAllByText('Replace me').length;

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

    // Count should not increase (optimistic was replaced, not duplicated)
    await waitFor(() => {
      const afterCount = screen.getAllByText('Replace me').length;
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

    global.fetch = mockFetch([errorMsg]);
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
});
