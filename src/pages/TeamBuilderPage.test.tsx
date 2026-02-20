import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TeamBuilderPage } from './TeamBuilderPage';
import { mockTeam } from '../test/mocks';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  vi.restoreAllMocks();
  mockNavigate.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamBuilderPage />
    </MemoryRouter>,
  );
}

describe('TeamBuilderPage', () => {
  it('renders step 1 by default', () => {
    renderPage();
    expect(screen.getByText('Team Config')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Agent Team')).toBeInTheDocument();
  });

  it('disables Next when team name is empty', () => {
    renderPage();
    const nextBtn = screen.getByText('Next');
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next when team name is filled', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('navigates to step 2 on Next', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
  });

  it('can add and remove agents in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Agent'));
    expect(screen.getByText('Agent 2')).toBeInTheDocument();

    const removeButtons = screen.getAllByText('Remove');
    await userEvent.click(removeButtons[0]);
    expect(screen.queryByText('Agent 2')).not.toBeInTheDocument();
  });

  it('goes back from step 2 to step 1', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Back'));
    expect(screen.getByPlaceholderText('My Agent Team')).toBeInTheDocument();
  });

  it('shows review in step 3', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Team Configuration')).toBeInTheDocument();
    expect(screen.getByText('my-team')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Create & Deploy')).toBeInTheDocument();
  });

  it('creates team on submit', async () => {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';

      if (method === 'POST' && url.endsWith('/api/teams')) {
        return new Response(JSON.stringify(mockTeam), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/teams/team-uuid-1');
    });
  });

  it('navigates home on Cancel', async () => {
    renderPage();
    await userEvent.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows workspace path input in step 1', () => {
    renderPage();
    expect(screen.getByPlaceholderText('/path/to/your/project')).toBeInTheDocument();
    expect(screen.getByText('Local directory to mount inside agent containers. Agents can read and write files here.')).toBeInTheDocument();
  });

  it('includes workspace_path in the review and create payload', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/api/teams')) {
        return new Response(JSON.stringify(mockTeam), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.type(screen.getByPlaceholderText('/path/to/your/project'), '/home/user/project');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    // Step 3 review should display the workspace path
    expect(screen.getByText('/home/user/project')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.workspace_path).toBe('/home/user/project');
    });
  });

  it('omits workspace_path from payload when empty', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/api/teams')) {
        return new Response(JSON.stringify(mockTeam), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    // Leave workspace path empty
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.workspace_path).toBeUndefined();
    });
  });

  it('does not show skills section in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.queryByText('Skills')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add skill and press Enter')).not.toBeInTheDocument();
  });

  it('does not include skills in create payload', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/api/teams')) {
        return new Response(JSON.stringify(mockTeam), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.agents[0]).not.toHaveProperty('skills');
    });
  });

  it('shows specialty and system prompt fields in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByPlaceholderText('e.g. frontend development, testing, code review')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Instructions for the agent...')).toBeInTheDocument();
  });

  it('includes specialty and system_prompt in create payload', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/api/teams')) {
        return new Response(JSON.stringify(mockTeam), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.type(screen.getByPlaceholderText('e.g. frontend development, testing, code review'), 'backend');
    await userEvent.type(screen.getByPlaceholderText('Instructions for the agent...'), 'You are a backend dev');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.agents[0].specialty).toBe('backend');
      expect(body.agents[0].system_prompt).toBe('You are a backend dev');
    });
  });

  it('shows JSON preview in step 3', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('JSON Preview')).toBeInTheDocument();
    // The JSON preview should contain the team name
    const pre = screen.getByText(/\"name\": \"my-team\"/);
    expect(pre).toBeInTheDocument();
  });

  it('creates and deploys team on Create & Deploy', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/api/teams')) {
        return new Response(JSON.stringify(mockTeam), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'POST' && url.includes('/deploy')) {
        return new Response(JSON.stringify({ status: 'deploying' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create & Deploy'));

    await waitFor(() => {
      // Should call both create and deploy endpoints
      const deployCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.includes('/deploy') && call[1]?.method === 'POST';
      });
      expect(deployCall).toBeTruthy();
      expect(mockNavigate).toHaveBeenCalledWith('/teams/team-uuid-1');
    });
  });

  it('assigns leader role to first agent and worker to subsequent', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // First agent should be Leader
    expect(screen.getByText('Leader')).toBeInTheDocument();

    // Add second agent
    await userEvent.click(screen.getByText('+ Add Agent'));
    expect(screen.getByText('Worker')).toBeInTheDocument();
  });

  it('disables Next in step 2 when agent name is empty', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // Agent name is empty, Next should be disabled
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('shows step indicators with correct states', () => {
    renderPage();
    // Step 1 is active, steps 2 and 3 are inactive
    expect(screen.getByText('Team Config')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });
});
