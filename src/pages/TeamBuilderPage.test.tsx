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
    expect(screen.getByText('Leader Agent')).toBeInTheDocument();
  });

  it('can add and remove sub-agents in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    expect(screen.getByText('Sub-Agent 1')).toBeInTheDocument();

    const removeButtons = screen.getAllByText('Remove');
    await userEvent.click(removeButtons[0]);
    expect(screen.queryByText('Sub-Agent 1')).not.toBeInTheDocument();
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

  it('shows global skills section for leader in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Global Skills (shared with all agents)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://github.com/owner/repo')).toBeInTheDocument();
  });

  it('does not include sub_agent_skills in leader payload when none added', async () => {
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
      expect(body.agents[0]).not.toHaveProperty('sub_agent_skills');
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

  it('shows instructions editor for leader in step 2 (Claude provider)', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('CLAUDE.md Content')).toBeInTheDocument();
    expect(screen.getByText("This content will be written to the agent's CLAUDE.md file at deploy time.")).toBeInTheDocument();
  });

  it('pre-populates instructions with default template', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    const textarea = screen.getByPlaceholderText('# Agent instructions in Markdown...');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toContain('# Agent:');
    expect((textarea as HTMLTextAreaElement).value).toContain('## Role');
    expect((textarea as HTMLTextAreaElement).value).toContain('leader');
    expect((textarea as HTMLTextAreaElement).value).toContain('## Instructions');
    expect((textarea as HTMLTextAreaElement).value).toContain('## Team');
  });

  it('shows structured fields for sub-agent instead of CLAUDE.md', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));

    // Sub-agent should show structured fields
    expect(screen.getByPlaceholderText('What does this sub-agent do? The leader uses this to decide when to invoke it.')).toBeInTheDocument();
    // Both leader and sub-agent have repo/skill inputs now
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    expect(repoInputs.length).toBe(2); // leader + sub-agent
    const skillInputs = screen.getAllByPlaceholderText('skill-name');
    expect(skillInputs.length).toBe(2); // leader + sub-agent
    expect(screen.getByText('Inherit (default)')).toBeInTheDocument();

    // Sub-agent should NOT have CLAUDE.md textarea (only 1 from the leader)
    const claudeTextareas = screen.getAllByPlaceholderText('# Agent instructions in Markdown...');
    expect(claudeTextareas).toHaveLength(1);
  });

  it('includes instructions_md in create payload for leader', async () => {
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
    const instructionsEditor = screen.getByPlaceholderText('# Agent instructions in Markdown...');
    await userEvent.clear(instructionsEditor);
    await userEvent.type(instructionsEditor, '# Custom instructions');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.agents[0].instructions_md).toBe('# Custom instructions');
    });
  });

  it('includes sub-agent fields in create payload for workers', async () => {
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

    // Fill leader
    const nameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(nameInputs[0], 'leader');

    // Add sub-agent
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    const allNameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(allNameInputs[1], 'worker-1');
    await userEvent.type(
      screen.getByPlaceholderText('What does this sub-agent do? The leader uses this to decide when to invoke it.'),
      'Handles backend API tasks',
    );
    // Use the sub-agent's repo/skill inputs (index 1, leader is index 0)
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    const skillNameInputs = screen.getAllByPlaceholderText('skill-name');
    const repoInput = repoInputs[1]; // sub-agent repo input
    const nameInput = skillNameInputs[1]; // sub-agent skill name input
    const addBtns = screen.getAllByText('Add');
    const addBtn = addBtns[1]; // sub-agent Add button

    await userEvent.type(repoInput, 'https://github.com/anthropic/tools');
    await userEvent.type(nameInput, 'read');
    await userEvent.click(addBtn);

    await userEvent.type(repoInput, 'https://github.com/anthropic/tools');
    await userEvent.type(nameInput, 'bash');
    await userEvent.click(addBtn);

    await userEvent.type(repoInput, 'https://github.com/anthropic/tools');
    await userEvent.type(nameInput, 'edit');
    await userEvent.click(addBtn);

    // Change model to sonnet
    await userEvent.selectOptions(screen.getByDisplayValue('Inherit (default)'), 'sonnet');

    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);

      // Leader should have instructions_md, not sub-agent fields
      expect(body.agents[0].role).toBe('leader');
      expect(body.agents[0]).toHaveProperty('instructions_md');
      expect(body.agents[0]).not.toHaveProperty('sub_agent_description');

      // Worker should have sub-agent fields, not instructions_md
      expect(body.agents[1].role).toBe('worker');
      expect(body.agents[1].sub_agent_description).toBe('Handles backend API tasks');
      expect(body.agents[1].sub_agent_skills).toEqual([
        { repo_url: 'https://github.com/anthropic/tools', skill_name: 'read' },
        { repo_url: 'https://github.com/anthropic/tools', skill_name: 'bash' },
        { repo_url: 'https://github.com/anthropic/tools', skill_name: 'edit' },
      ]);
      expect(body.agents[1].sub_agent_model).toBe('sonnet');
      expect(body.agents[1]).not.toHaveProperty('instructions_md');
    });
  });

  it('omits default model and permission mode from worker payload', async () => {
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

    const nameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(nameInputs[0], 'leader');

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    const allNameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(allNameInputs[1], 'worker-1');
    await userEvent.type(
      screen.getByPlaceholderText('What does this sub-agent do? The leader uses this to decide when to invoke it.'),
      'A sub-agent',
    );
    // Leave model as inherit and permission as default

    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.agents[1].sub_agent_model).toBeUndefined();
      expect(body.agents[1].sub_agent_skills).toBeUndefined();
    });
  });

  it('shows instructions preview in step 3 review for leader', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    // The review should show the CLAUDE.md content in a pre block
    const agentHeadings = screen.getAllByText(/# Agent:/);
    expect(agentHeadings.length).toBeGreaterThanOrEqual(1);
    const instructionHeadings = screen.getAllByText(/## Instructions/);
    expect(instructionHeadings.length).toBeGreaterThanOrEqual(1);
  });

  it('shows sub-agent YAML frontmatter preview in step 3', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    const nameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(nameInputs[0], 'leader');

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    const allNameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(allNameInputs[1], 'my-worker');
    await userEvent.type(
      screen.getByPlaceholderText('What does this sub-agent do? The leader uses this to decide when to invoke it.'),
      'Builds frontend components',
    );
    // Use sub-agent inputs (index 1, leader is index 0)
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    const skillNameInputs = screen.getAllByPlaceholderText('skill-name');
    const addBtns = screen.getAllByText('Add');
    const repoInput = repoInputs[1];
    const nameInput = skillNameInputs[1];
    const addBtn = addBtns[1];
    await userEvent.type(repoInput, 'https://github.com/anthropic/tools');
    await userEvent.type(nameInput, 'read');
    await userEvent.click(addBtn);
    await userEvent.type(repoInput, 'https://github.com/anthropic/tools');
    await userEvent.type(nameInput, 'write');
    await userEvent.click(addBtn);
    await userEvent.selectOptions(screen.getByDisplayValue('Inherit (default)'), 'opus');

    await userEvent.click(screen.getByText('Next'));

    // Sub-agent preview should show YAML frontmatter
    const preview = screen.getByTestId('sub-agent-preview-my-worker');
    expect(preview.textContent).toContain('---');
    expect(preview.textContent).toContain('name: my-worker');
    expect(preview.textContent).toContain('description: Builds frontend components');
    expect(preview.textContent).toContain('model: opus');
    expect(preview.textContent).toContain('background: true');
    expect(preview.textContent).toContain('isolation: worktree');
    expect(preview.textContent).toContain('permissionMode: bypassPermissions');
    expect(preview.textContent).toContain('skills:');
    expect(preview.textContent).toContain('  - skill_name: read');
    expect(preview.textContent).toContain('    repo_url: https://github.com/anthropic/tools');
    expect(preview.textContent).toContain('  - skill_name: write');
  });

  it('shows JSON preview in step 3 with instructions_md field', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('JSON Preview')).toBeInTheDocument();
    // The JSON preview should contain instructions_md, not specialty/system_prompt
    const pre = screen.getByText(/\"name\": \"my-team\"/);
    expect(pre).toBeInTheDocument();
    expect(pre.textContent).toContain('instructions_md');
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

  it('assigns leader role to first agent and sub-agent to subsequent', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // First agent should be Leader
    expect(screen.getByText('Leader')).toBeInTheDocument();

    // Add second agent
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    expect(screen.getByText('Sub-Agent')).toBeInTheDocument();
  });

  it('disables Next in step 2 when agent name is empty', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // Agent name is empty, Next should be disabled
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('disables Next in step 2 when sub-agent description is empty', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // Fill leader name
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');

    // Add a sub-agent with name but no description
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    const allNameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(allNameInputs[1], 'worker');

    // Next should be disabled because sub-agent description is required
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('shows step indicators with correct states', () => {
    renderPage();
    // Step 1 is active, steps 2 and 3 are inactive
    expect(screen.getByText('Team Config')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('allows editing instructions content', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    const textarea = screen.getByPlaceholderText('# Agent instructions in Markdown...');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# My custom agent config');
    expect((textarea as HTMLTextAreaElement).value).toBe('# My custom agent config');
  });

  it('rejects invalid repository URL with toast error', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    // Use sub-agent inputs (index 1, leader is index 0)
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    const skillNameInputs = screen.getAllByPlaceholderText('skill-name');
    const repoInput = repoInputs[1];
    const nameInput = skillNameInputs[1];
    const addBtns = screen.getAllByText('Add');

    await userEvent.type(repoInput, 'not-a-url');
    await userEvent.type(nameInput, 'test-skill');
    await userEvent.click(addBtns[1]);

    // Invalid URL should not be added
    await waitFor(() => {
      expect(screen.queryByText('test-skill')).not.toBeInTheDocument();
    });
  });

  it('accepts valid repo URL and skill name', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    // Use sub-agent inputs (index 1, leader is index 0)
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    const skillNameInputs = screen.getAllByPlaceholderText('skill-name');
    const addBtns = screen.getAllByText('Add');

    await userEvent.type(repoInputs[1], 'https://github.com/vercel-labs/agent-skills');
    await userEvent.type(skillNameInputs[1], 'react-best-practices');
    await userEvent.click(addBtns[1]);

    await waitFor(() => {
      expect(screen.getByText('react-best-practices')).toBeInTheDocument();
    });
  });

  it('enforces maximum skills per agent limit', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    // Use sub-agent inputs (index 1, leader is index 0)
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    const skillNameInputs = screen.getAllByPlaceholderText('skill-name');
    const addBtns = screen.getAllByText('Add');
    const repoInput = repoInputs[1];
    const nameInput = skillNameInputs[1];
    const addBtn = addBtns[1];

    // Add 20 skills (the max)
    for (let i = 0; i < 20; i++) {
      await userEvent.type(repoInput, 'https://github.com/owner/repo');
      await userEvent.type(nameInput, `skill-${i}`);
      await userEvent.click(addBtn);
    }

    // 21st should be rejected
    await userEvent.type(repoInput, 'https://github.com/owner/repo');
    await userEvent.type(nameInput, 'skill-overflow');
    await userEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.queryByText('skill-overflow')).not.toBeInTheDocument();
    });
  });

  it('shows Claude model dropdown with correct options for sub-agents', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));

    const modelSelect = screen.getByDisplayValue('Inherit (default)');
    expect(modelSelect).toBeInTheDocument();

    // Verify all model options for Claude provider (default)
    const options = modelSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toEqual(['inherit', 'sonnet', 'opus', 'haiku']);
  });
});

describe('TeamBuilderPage — skill interactions', () => {
  async function goToStep2WithSubAgent() {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
  }

  // Helper to get sub-agent skill inputs (index 1, leader is index 0)
  function getSubAgentSkillInputs() {
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    const skillNameInputs = screen.getAllByPlaceholderText('skill-name');
    const addBtns = screen.getAllByText('Add');
    return {
      repoInput: repoInputs[1],
      nameInput: skillNameInputs[1],
      addBtn: addBtns[1],
    };
  }

  it('removes a skill by clicking the × button', async () => {
    await goToStep2WithSubAgent();
    const { repoInput, nameInput, addBtn } = getSubAgentSkillInputs();

    await userEvent.type(repoInput, 'https://github.com/jezweb/claude-skills');
    await userEvent.type(nameInput, 'fastapi');
    await userEvent.click(addBtn);
    expect(screen.getByText('fastapi')).toBeInTheDocument();

    // Click the × button inside the skill chip
    const innerSpan = screen.getByText('fastapi');
    const chipSpan = innerSpan.parentElement!;
    const removeBtn = chipSpan.querySelector('button')!;
    await userEvent.click(removeBtn);

    expect(screen.queryByText('fastapi')).not.toBeInTheDocument();
  });

  it('shows duplicate error for identical skills', async () => {
    await goToStep2WithSubAgent();
    const { repoInput, nameInput, addBtn } = getSubAgentSkillInputs();

    await userEvent.type(repoInput, 'https://github.com/owner/repo');
    await userEvent.type(nameInput, 'dupe-skill');
    await userEvent.click(addBtn);

    await userEvent.type(repoInput, 'https://github.com/owner/repo');
    await userEvent.type(nameInput, 'dupe-skill');
    await userEvent.click(addBtn);

    // Only one instance should be present
    const matches = screen.getAllByText('dupe-skill');
    expect(matches).toHaveLength(1);
  });

  it('rejects missing repository URL', async () => {
    await goToStep2WithSubAgent();
    const { nameInput, addBtn } = getSubAgentSkillInputs();

    await userEvent.type(nameInput, 'fastapi');
    await userEvent.click(addBtn);

    // Skill should not be added without repo URL
    await waitFor(() => {
      expect(screen.queryByText('fastapi')).not.toBeInTheDocument();
    });
  });

  it('rejects non-HTTPS repository URL', async () => {
    await goToStep2WithSubAgent();
    const { repoInput, nameInput, addBtn } = getSubAgentSkillInputs();

    await userEvent.type(repoInput, 'http://github.com/owner/repo');
    await userEvent.type(nameInput, 'test-skill');
    await userEvent.click(addBtn);

    // Skill should not be added with HTTP URL
    await waitFor(() => {
      expect(screen.queryByText('test-skill')).not.toBeInTheDocument();
    });
  });

  it('accepts valid repo URL and skill name via two fields', async () => {
    await goToStep2WithSubAgent();
    const { repoInput, nameInput, addBtn } = getSubAgentSkillInputs();

    await userEvent.type(repoInput, 'https://github.com/vercel-labs/agent-skills');
    await userEvent.type(nameInput, 'react-best-practices');
    await userEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('react-best-practices')).toBeInTheDocument();
    });
  });

  it('adds a skill via Enter key on repo input', async () => {
    await goToStep2WithSubAgent();
    const { repoInput, nameInput } = getSubAgentSkillInputs();

    await userEvent.type(repoInput, 'https://github.com/owner/repo');
    await userEvent.type(nameInput, 'enter-skill');
    // Press Enter on repo input
    await userEvent.type(repoInput, '{Enter}');

    await waitFor(() => {
      expect(screen.getByText('enter-skill')).toBeInTheDocument();
    });
  });
});

describe('TeamBuilderPage — provider selector', () => {
  it('renders provider selector cards in step 1', () => {
    renderPage();
    expect(screen.getByTestId('provider-card-claude')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-opencode')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('OpenCode')).toBeInTheDocument();
  });

  it('defaults to Claude provider (blue border)', () => {
    renderPage();
    const claudeCard = screen.getByTestId('provider-card-claude');
    expect(claudeCard.className).toContain('border-blue-500');
  });

  it('switches to OpenCode provider on click', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    const opencodeCard = screen.getByTestId('provider-card-opencode');
    expect(opencodeCard.className).toContain('border-emerald-500');
  });

  it('shows AGENTS.md label for OpenCode provider', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('AGENTS.md Content')).toBeInTheDocument();
  });

  it('shows OpenCode model list with optgroups for sub-agents', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));

    const modelSelect = screen.getByDisplayValue('Inherit (default)');
    expect(modelSelect).toBeInTheDocument();

    // Should contain optgroups
    const optgroups = modelSelect.querySelectorAll('optgroup');
    expect(optgroups.length).toBeGreaterThanOrEqual(4); // Anthropic, OpenAI, Google, Local
  });

  it('resets agent models to inherit when provider changes', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));

    // Select a Claude model
    await userEvent.selectOptions(screen.getByDisplayValue('Inherit (default)'), 'sonnet');
    expect((screen.getByDisplayValue('Sonnet') as HTMLSelectElement).value).toBe('sonnet');

    // Go back and change provider
    await userEvent.click(screen.getByText('Back'));
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByText('Next'));

    // Model should be reset to inherit
    const modelSelect = screen.getByDisplayValue('Inherit (default)');
    expect(modelSelect).toBeInTheDocument();
  });

  it('includes provider in create payload', async () => {
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
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
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
      expect(body.provider).toBe('opencode');
    });
  });

  it('shows provider badge in step 3 review', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('OpenCode')).toBeInTheDocument();
  });
});

