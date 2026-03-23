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

    // Toggle to raw mode to access the textarea
    const toggles = screen.getAllByTestId('markdown-editor-toggle');
    await userEvent.click(toggles[0]);

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
    expect(screen.getByPlaceholderText('Short one-liner: what does this sub-agent do?')).toBeInTheDocument();
    // Both leader and sub-agent have repo/skill inputs now
    const repoInputs = screen.getAllByPlaceholderText('https://github.com/owner/repo');
    expect(repoInputs.length).toBe(2); // leader + sub-agent
    const skillInputs = screen.getAllByPlaceholderText('skill-name');
    expect(skillInputs.length).toBe(2); // leader + sub-agent
    // Both leader and sub-agent have model selects with "Inherit (default)"
    const modelSelects = screen.getAllByDisplayValue('Inherit (default)');
    expect(modelSelects.length).toBe(2); // leader + sub-agent

    // Both leader and sub-agent have markdown editors (2 total)
    const editors = screen.getAllByTestId('markdown-editor');
    expect(editors).toHaveLength(2);

    // Toggle both to raw mode — leader has instructions placeholder, sub-agent has its own
    const toggles = screen.getAllByTestId('markdown-editor-toggle');
    await userEvent.click(toggles[0]);
    await userEvent.click(toggles[1]);
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
    // Toggle to raw mode, clear default and type custom content
    const toggles = screen.getAllByTestId('markdown-editor-toggle');
    await userEvent.click(toggles[0]);
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
      screen.getByPlaceholderText('Short one-liner: what does this sub-agent do?'),
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

    // Change model to sonnet on the sub-agent (index 1; index 0 is leader)
    const modelSelects = screen.getAllByDisplayValue('Inherit (default)');
    await userEvent.selectOptions(modelSelects[1], 'sonnet');

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
      screen.getByPlaceholderText('Short one-liner: what does this sub-agent do?'),
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
      screen.getByPlaceholderText('Short one-liner: what does this sub-agent do?'),
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
    // Select opus on the sub-agent model dropdown (index 1; index 0 is leader)
    const modelSelectsForPreview = screen.getAllByDisplayValue('Inherit (default)');
    await userEvent.selectOptions(modelSelectsForPreview[1], 'opus');

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

  it('shows sub-agent instructions as body after frontmatter in preview', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    const nameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(nameInputs[0], 'leader');

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    const allNameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(allNameInputs[1], 'my-worker');
    await userEvent.type(
      screen.getByPlaceholderText('Short one-liner: what does this sub-agent do?'),
      'Runs tests',
    );
    // Toggle sub-agent instructions editor to raw mode
    const toggles = screen.getAllByTestId('markdown-editor-toggle');
    await userEvent.click(toggles[1]); // Second editor = sub-agent
    await userEvent.type(
      screen.getByPlaceholderText('Detailed instructions for the sub-agent (supports Markdown)'),
      'You must run all unit tests before reporting results.',
    );

    await userEvent.click(screen.getByText('Next'));

    const preview = screen.getByTestId('sub-agent-preview-my-worker');
    const text = preview.textContent || '';
    // Instructions should appear as body after the closing ---
    const lastFrontmatterClose = text.lastIndexOf('---');
    const instructionsText = text.slice(lastFrontmatterClose + 3);
    expect(instructionsText).toContain('You must run all unit tests before reporting results.');
    // Description stays in frontmatter
    expect(text).toContain('description: Runs tests');
  });

  it('omits instructions body from preview when instructions is empty', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    const nameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(nameInputs[0], 'leader');

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    const allNameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(allNameInputs[1], 'my-worker');
    await userEvent.type(
      screen.getByPlaceholderText('Short one-liner: what does this sub-agent do?'),
      'Runs tests',
    );
    // Leave instructions empty

    await userEvent.click(screen.getByText('Next'));

    const preview = screen.getByTestId('sub-agent-preview-my-worker');
    const text = preview.textContent || '';
    // Should end with the closing --- (no body content after it)
    const parts = text.split('---');
    // frontmatter has opening and closing ---, so parts[2] (after second ---) should be empty or not exist
    const afterFrontmatter = (parts[2] || '').trim();
    expect(afterFrontmatter).toBe('');
  });

  it('includes sub_agent_instructions in JSON preview for workers', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    const nameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(nameInputs[0], 'leader');

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));
    const allNameInputs = screen.getAllByPlaceholderText('Agent name');
    await userEvent.type(allNameInputs[1], 'my-worker');
    await userEvent.type(
      screen.getByPlaceholderText('Short one-liner: what does this sub-agent do?'),
      'Runs tests',
    );
    // Toggle sub-agent instructions editor to raw mode
    const toggles = screen.getAllByTestId('markdown-editor-toggle');
    await userEvent.click(toggles[1]); // Second editor = sub-agent
    await userEvent.type(
      screen.getByPlaceholderText('Detailed instructions for the sub-agent (supports Markdown)'),
      'Run pytest with coverage.',
    );

    await userEvent.click(screen.getByText('Next'));

    // The JSON preview should contain sub_agent_instructions
    const pre = screen.getByText(/\"name\": \"my-team\"/);
    expect(pre.textContent).toContain('sub_agent_instructions');
    expect(pre.textContent).toContain('Run pytest with coverage.');
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

    // Toggle to raw mode to access textarea
    const toggles = screen.getAllByTestId('markdown-editor-toggle');
    await userEvent.click(toggles[0]);
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

  it('shows model dropdown for leader in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // Leader should have a model select (no sub-agents needed)
    const leaderModelSelect = screen.getByTestId('leader-model-select');
    expect(leaderModelSelect).toBeInTheDocument();

    // Verify it has Claude models by default
    const options = leaderModelSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toEqual(['inherit', 'sonnet', 'opus', 'haiku']);
  });

  it('shows OpenCode model options in leader dropdown when OpenCode provider selected', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    const leaderModelSelect = screen.getByTestId('leader-model-select');
    expect(leaderModelSelect).toBeInTheDocument();

    // Should contain Anthropic models filtered by model provider
    const options = leaderModelSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toContain('inherit');
    expect(optionValues).toContain('anthropic/claude-sonnet-4-6');
    expect(optionValues).toContain('anthropic/claude-opus-4-6');
    // Should NOT contain other providers' models
    expect(optionValues).not.toContain('openai/gpt-5.3-codex');
    expect(optionValues).not.toContain('google/gemini-2.5-pro');
  });

  it('includes leader sub_agent_model in create payload when non-default', async () => {
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

    // Change leader model to opus
    const leaderModelSelect = screen.getByTestId('leader-model-select');
    await userEvent.selectOptions(leaderModelSelect, 'opus');

    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.agents[0].role).toBe('leader');
      expect(body.agents[0].sub_agent_model).toBe('opus');
    });
  });

  it('omits leader sub_agent_model from payload when inherit (default)', async () => {
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
    // Leave model as inherit (default)

    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.endsWith('/api/teams') && call[1]?.method === 'POST';
      });
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1]!.body as string);
      expect(body.agents[0].role).toBe('leader');
      expect(body.agents[0].sub_agent_model).toBeUndefined();
    });
  });

  it('shows Claude model dropdown with correct options for sub-agents', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Sub-Agent'));

    // Both leader (index 0) and sub-agent (index 1) have model selects
    const modelSelects = screen.getAllByDisplayValue('Inherit (default)');
    expect(modelSelects.length).toBe(2);

    // Verify sub-agent model options for Claude provider (default)
    const subAgentSelect = modelSelects[1];
    const options = subAgentSelect.querySelectorAll('option');
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

  it('shows updated provider descriptions', () => {
    renderPage();
    expect(screen.getByText("Anthropic's official AI agent. Powered by Claude models.")).toBeInTheDocument();
    expect(screen.getByText('Open-source AI agent. Powered by Anthropic, OpenAI, Google, and local models.')).toBeInTheDocument();
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
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('AGENTS.md Content')).toBeInTheDocument();
  });

  it('shows filtered OpenCode model list for sub-agents', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-openai'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));

    // Both leader (index 0) and sub-agent (index 1) have model selects
    const modelSelects = screen.getAllByDisplayValue('Inherit (gpt-5.3-codex)');
    expect(modelSelects.length).toBe(2);

    // Verify sub-agent select has OpenAI models only
    const subAgentSelect = modelSelects[1];
    const options = subAgentSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toContain('inherit');
    expect(optionValues).toContain('openai/gpt-5.3-codex');
    expect(optionValues).toContain('openai/gpt-5.2');
    expect(optionValues).not.toContain('anthropic/claude-sonnet-4-6');
    expect(optionValues).not.toContain('google/gemini-2.5-pro');
  });

  it('resets agent models to inherit when provider changes', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('+ Add Sub-Agent'));

    // Select a Claude model on the sub-agent (index 1)
    const modelSelects = screen.getAllByDisplayValue('Inherit (default)');
    await userEvent.selectOptions(modelSelects[1], 'sonnet');
    expect((screen.getByDisplayValue('Sonnet') as HTMLSelectElement).value).toBe('sonnet');

    // Go back and change provider
    await userEvent.click(screen.getByText('Back'));
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));
    await userEvent.click(screen.getByText('Next'));

    // Both models should be reset to inherit — label shows the default model for the selected provider
    const resetSelects = screen.getAllByDisplayValue('Inherit (claude-sonnet-4-6)');
    expect(resetSelects.length).toBe(2); // leader + sub-agent
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
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));
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
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('OpenCode')).toBeInTheDocument();
  });
});

function mockFetchWithSettings(settingKeys: string[]) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.endsWith('/api/settings')) {
      const settings = settingKeys.map((key, i) => ({
        id: i + 1,
        key,
        value: '***',
        is_secret: true,
        updated_at: new Date().toISOString(),
      }));
      return new Response(JSON.stringify(settings), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && url.endsWith('/api/teams')) {
      return new Response(JSON.stringify(mockTeam), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('TeamBuilderPage — credential warnings', () => {
  it('shows team-level warning for missing Google credential when using OpenCode', async () => {
    global.fetch = mockFetchWithSettings(['ANTHROPIC_API_KEY']);

    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    // Select Google model provider — key is NOT configured
    await userEvent.click(screen.getByTestId('model-provider-card-google'));

    await waitFor(() => {
      expect(screen.getByTestId('team-credential-warning')).toBeInTheDocument();
      expect(screen.getByText(/GOOGLE_GENERATIVE_AI_API_KEY/)).toBeInTheDocument();
    });
  });

  it('does not show warning when credential is already configured', async () => {
    global.fetch = mockFetchWithSettings(['ANTHROPIC_API_KEY']);

    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    // Select Anthropic model provider — key IS configured
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));

    // Wait for settings fetch to resolve
    await waitFor(() => {
      expect(screen.queryByTestId('team-credential-warning')).not.toBeInTheDocument();
    });
  });
});

describe('TeamBuilderPage — model provider selector', () => {
  it('shows model provider cards when OpenCode is selected', async () => {
    renderPage();
    // Should NOT show model provider cards for Claude
    expect(screen.queryByTestId('model-provider-card-anthropic')).not.toBeInTheDocument();

    // Switch to OpenCode
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    expect(screen.getByTestId('model-provider-card-anthropic')).toBeInTheDocument();
    expect(screen.getByTestId('model-provider-card-openai')).toBeInTheDocument();
    expect(screen.getByTestId('model-provider-card-google')).toBeInTheDocument();
  });

  it('hides model provider cards when Claude is selected', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    expect(screen.getByTestId('model-provider-card-anthropic')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('provider-card-claude'));
    expect(screen.queryByTestId('model-provider-card-anthropic')).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-provider-card-openai')).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-provider-card-google')).not.toBeInTheDocument();
  });

  it('selecting model provider filters model list', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-google'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    const leaderModelSelect = screen.getByTestId('leader-model-select');
    const options = leaderModelSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toEqual(['inherit', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash']);
  });

  it('switching model provider resets agent models', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // Select a model on the leader
    const leaderModelSelect = screen.getByTestId('leader-model-select');
    await userEvent.selectOptions(leaderModelSelect, 'anthropic/claude-sonnet-4-6');
    expect((leaderModelSelect as HTMLSelectElement).value).toBe('anthropic/claude-sonnet-4-6');

    // Go back and change model provider
    await userEvent.click(screen.getByText('Back'));
    await userEvent.click(screen.getByTestId('model-provider-card-openai'));
    await userEvent.click(screen.getByText('Next'));

    // Leader model should be reset to inherit
    const resetSelect = screen.getByTestId('leader-model-select');
    expect((resetSelect as HTMLSelectElement).value).toBe('inherit');
  });

  it('switching provider resets model provider', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));

    // Verify Anthropic is selected (blue border)
    const anthropicCard = screen.getByTestId('model-provider-card-anthropic');
    expect(anthropicCard.className).toContain('border-blue-500');

    // Switch to Claude and back to OpenCode
    await userEvent.click(screen.getByTestId('provider-card-claude'));
    await userEvent.click(screen.getByTestId('provider-card-opencode'));

    // Model provider should be reset — none selected
    const resetAnthropicCard = screen.getByTestId('model-provider-card-anthropic');
    expect(resetAnthropicCard.className).not.toContain('border-blue-500');
    const resetOpenaiCard = screen.getByTestId('model-provider-card-openai');
    expect(resetOpenaiCard.className).not.toContain('border-green-500');
  });

  it('blocks step 1 without model provider for OpenCode', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');

    // Next should be disabled without model provider
    expect(screen.getByText('Next')).toBeDisabled();

    // Select a model provider
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));

    // Now Next should be enabled
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('payload includes model_provider', async () => {
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
    await userEvent.click(screen.getByTestId('model-provider-card-google'));
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
      expect(body.model_provider).toBe('google');
    });
  });

  it('shows model provider in step 3 review', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-openai'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Model Provider')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
  });

  it('omits model_provider from payload when Claude provider is used', async () => {
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
    // Claude is default, no model provider needed
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
      expect(body.model_provider).toBeUndefined();
    });
  });
});

describe('TeamBuilderPage — Ollama model provider', () => {
  it('shows Ollama card when OpenCode is selected', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    expect(screen.getByTestId('model-provider-card-ollama')).toBeInTheDocument();
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.getByText('Local open-source models. No API key required.')).toBeInTheDocument();
  });

  it('Ollama card has orange styling when selected', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-ollama'));
    const ollamaCard = screen.getByTestId('model-provider-card-ollama');
    expect(ollamaCard.className).toContain('border-orange-500');
    expect(ollamaCard.className).toContain('bg-orange-500/10');
  });

  it('selecting Ollama shows Ollama models with sizes in dropdown', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-ollama'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    const leaderSelect = screen.getByTestId('leader-model-select');
    const options = Array.from(leaderSelect.querySelectorAll('option'));
    const labels = options.map((o) => o.textContent);

    expect(labels).toContain('Inherit (qwen3:8b)');
    expect(labels).toContain('Devstral (~14 GB)');
    expect(labels).toContain('Qwen 3 8B (~5 GB)');
    expect(labels).toContain('Llama 3.3 8B (~5 GB)');
    expect(labels).toContain('Code Llama 13B (~7 GB)');
    expect(labels).toContain('Mistral 7B (~4 GB)');
  });

  it('shows no credential warning when Ollama is selected', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-ollama'));

    await waitFor(() => {
      expect(screen.queryByTestId('team-credential-warning')).not.toBeInTheDocument();
    });
  });

  it('includes model_provider ollama in create payload', async () => {
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
    await userEvent.click(screen.getByTestId('model-provider-card-ollama'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'ollama-team');
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
      expect(body.model_provider).toBe('ollama');
    });
  });

  it('switching from Ollama to another provider resets models', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('provider-card-opencode'));
    await userEvent.click(screen.getByTestId('model-provider-card-ollama'));
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    // Select an Ollama model on the leader
    const leaderSelect = screen.getByTestId('leader-model-select');
    await userEvent.selectOptions(leaderSelect, 'ollama/devstral');
    expect((leaderSelect as HTMLSelectElement).value).toBe('ollama/devstral');

    // Go back and switch to Anthropic
    await userEvent.click(screen.getByText('Back'));
    await userEvent.click(screen.getByTestId('model-provider-card-anthropic'));
    await userEvent.click(screen.getByText('Next'));

    // Model should be reset to inherit
    const resetSelect = screen.getByTestId('leader-model-select');
    expect((resetSelect as HTMLSelectElement).value).toBe('inherit');

    // Ollama models should no longer appear
    const options = Array.from(resetSelect.querySelectorAll('option'));
    const labels = options.map((o) => o.textContent);
    expect(labels).not.toContain('Devstral (~14 GB)');
    expect(labels).toContain('Claude Sonnet 4.6');
  });
});

