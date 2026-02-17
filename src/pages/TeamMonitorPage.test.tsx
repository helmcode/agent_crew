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
});
