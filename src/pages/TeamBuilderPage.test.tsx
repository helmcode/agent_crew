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

  it('does not show specialty or system prompt fields in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.queryByText('Specialty')).not.toBeInTheDocument();
    expect(screen.queryByText('System Prompt')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. frontend development, testing, code review')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Instructions for the agent...')).not.toBeInTheDocument();
  });

  it('does not include specialty or system_prompt in create payload', async () => {
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
      expect(body.agents[0]).not.toHaveProperty('specialty');
      expect(body.agents[0]).not.toHaveProperty('system_prompt');
    });
  });

  it('shows CLAUDE.md editor in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('CLAUDE.md Content')).toBeInTheDocument();
    expect(screen.getByText('This content will be written to the agent\'s CLAUDE.md file at deploy time.')).toBeInTheDocument();
  });

  it('pre-populates CLAUDE.md with default template', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    const textarea = screen.getByPlaceholderText('# Agent instructions in Markdown...');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toContain('# Agent:');
    expect((textarea as HTMLTextAreaElement).value).toContain('## Role');
    expect((textarea as HTMLTextAreaElement).value).toContain('leader');
    expect((textarea as HTMLTextAreaElement).value).toContain('## Instructions');
  });

  it('pre-populates worker agent with worker role template', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Agent'));

    const textareas = screen.getAllByPlaceholderText('# Agent instructions in Markdown...');
    expect((textareas[1] as HTMLTextAreaElement).value).toContain('worker');
  });

  it('includes claude_md in create payload', async () => {
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
    // Clear default and type custom content
    const claudeEditor = screen.getByPlaceholderText('# Agent instructions in Markdown...');
    await userEvent.clear(claudeEditor);
    await userEvent.type(claudeEditor, '# Custom instructions');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.agents[0].claude_md).toBe('# Custom instructions');
    });
  });

  it('shows CLAUDE.md preview in step 3 review', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    // The review should show the CLAUDE.md content in a pre block
    // Text appears in both the review preview and JSON preview, so use getAllByText
    const agentHeadings = screen.getAllByText(/# Agent:/);
    expect(agentHeadings.length).toBeGreaterThanOrEqual(1);
    const instructionHeadings = screen.getAllByText(/## Instructions/);
    expect(instructionHeadings.length).toBeGreaterThanOrEqual(1);
  });

  it('shows JSON preview in step 3 with claude_md field', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('JSON Preview')).toBeInTheDocument();
    // The JSON preview should contain claude_md, not specialty/system_prompt
    const pre = screen.getByText(/\"name\": \"my-team\"/);
    expect(pre).toBeInTheDocument();
    expect(pre.textContent).toContain('claude_md');
    expect(pre.textContent).not.toContain('specialty');
    expect(pre.textContent).not.toContain('system_prompt');
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

  it('allows editing CLAUDE.md content', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    const textarea = screen.getByPlaceholderText('# Agent instructions in Markdown...');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# My custom agent config');
    expect((textarea as HTMLTextAreaElement).value).toBe('# My custom agent config');
  });
});
