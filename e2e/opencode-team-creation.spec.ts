import { test, expect } from '@playwright/test';

/**
 * E2E tests for OpenCode provider integration in the team creation wizard.
 * Covers provider selection, model dropdowns, step navigation, and full flows
 * for both Claude and OpenCode providers.
 */

const createdClaudeTeam = {
  id: 'team-claude-1',
  name: 'claude-e2e-team',
  description: 'Claude team via E2E',
  status: 'stopped',
  runtime: 'docker',
  workspace_path: '/tmp/e2e-claude',
  provider: 'claude',
  agents: [
    {
      id: 'agent-c-1',
      team_id: 'team-claude-1',
      name: 'claude-leader',
      role: 'leader',
      claude_md: '# Leader',
      specialty: '',
      system_prompt: '',
      skills: [],
      permissions: {},
      resources: {},
      container_id: '',
      container_status: 'stopped',
      created_at: '2026-02-27T00:00:00Z',
      updated_at: '2026-02-27T00:00:00Z',
    },
  ],
  created_at: '2026-02-27T00:00:00Z',
  updated_at: '2026-02-27T00:00:00Z',
};

const createdOpenCodeTeam = {
  id: 'team-opencode-1',
  name: 'opencode-e2e-team',
  description: 'OpenCode team via E2E',
  status: 'stopped',
  runtime: 'docker',
  workspace_path: '/tmp/e2e-opencode',
  provider: 'opencode',
  agents: [
    {
      id: 'agent-o-1',
      team_id: 'team-opencode-1',
      name: 'opencode-leader',
      role: 'leader',
      claude_md: '# Leader',
      specialty: '',
      system_prompt: '',
      skills: [],
      permissions: {},
      resources: {},
      container_id: '',
      container_status: 'stopped',
      created_at: '2026-02-27T00:00:00Z',
      updated_at: '2026-02-27T00:00:00Z',
    },
    {
      id: 'agent-o-2',
      team_id: 'team-opencode-1',
      name: 'opencode-worker',
      role: 'worker',
      claude_md: '',
      specialty: '',
      system_prompt: '',
      skills: [],
      sub_agent_description: 'Handles API work',
      sub_agent_skills: [],
      sub_agent_model: 'openai/gpt-4o',
      permissions: {},
      resources: {},
      container_id: '',
      container_status: 'stopped',
      created_at: '2026-02-27T00:00:00Z',
      updated_at: '2026-02-27T00:00:00Z',
    },
  ],
  created_at: '2026-02-27T00:00:00Z',
  updated_at: '2026-02-27T00:00:00Z',
};

test.describe('Team Creation - Provider Selection (Step 1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teams/new');
  });

  test('should display both provider cards', async ({ page }) => {
    await expect(page.getByTestId('provider-card-claude')).toBeVisible();
    await expect(page.getByTestId('provider-card-opencode')).toBeVisible();
    await expect(page.getByText('Claude Code')).toBeVisible();
    await expect(page.getByText('OpenCode')).toBeVisible();
  });

  test('should have Claude selected by default with blue border', async ({ page }) => {
    const claudeCard = page.getByTestId('provider-card-claude');
    await expect(claudeCard).toHaveClass(/border-blue-500/);
    await expect(claudeCard).toHaveClass(/bg-blue-500/);
  });

  test('should select OpenCode provider with emerald border', async ({ page }) => {
    const opencodeCard = page.getByTestId('provider-card-opencode');
    await opencodeCard.click();

    // OpenCode card should have emerald styling
    await expect(opencodeCard).toHaveClass(/border-emerald-500/);
    await expect(opencodeCard).toHaveClass(/bg-emerald-500/);

    // Claude card should lose blue styling
    const claudeCard = page.getByTestId('provider-card-claude');
    await expect(claudeCard).toHaveClass(/border-slate-700/);
  });

  test('should toggle back to Claude after selecting OpenCode', async ({ page }) => {
    // Select OpenCode
    await page.getByTestId('provider-card-opencode').click();
    await expect(page.getByTestId('provider-card-opencode')).toHaveClass(/border-emerald-500/);

    // Switch back to Claude
    await page.getByTestId('provider-card-claude').click();
    await expect(page.getByTestId('provider-card-claude')).toHaveClass(/border-blue-500/);
    await expect(page.getByTestId('provider-card-opencode')).toHaveClass(/border-slate-700/);
  });

  test('should show provider description text', async ({ page }) => {
    await expect(page.getByText("Anthropic's official AI coding agent")).toBeVisible();
    await expect(page.getByText('Open-source AI agent supporting 75+ model providers')).toBeVisible();
  });
});

test.describe('Team Creation - Claude Models (Step 2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teams/new');
    // Claude is default — fill step 1 and proceed to step 2
    await page.getByPlaceholder('My Agent Team').fill('claude-model-test');
    await page.getByRole('button', { name: 'Next' }).click();
    // Add a sub-agent to access model selector
    await page.getByText('+ Add Sub-Agent').click();
  });

  test('should show Claude models in dropdown', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    const options = modelSelect.locator('option');

    // Verify Claude model options
    await expect(options.filter({ hasText: 'Inherit (default)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Sonnet' })).toBeVisible();
    await expect(options.filter({ hasText: 'Opus' })).toBeVisible();
    await expect(options.filter({ hasText: 'Haiku' })).toBeVisible();
  });

  test('should NOT show optgroups for Claude models', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    const optgroups = modelSelect.locator('optgroup');
    await expect(optgroups).toHaveCount(0);
  });

  test('should default model to Inherit', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    await expect(modelSelect).toHaveValue('inherit');
  });

  test('should allow selecting a Claude model', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    await modelSelect.selectOption('opus');
    await expect(modelSelect).toHaveValue('opus');
  });
});

test.describe('Team Creation - OpenCode Models (Step 2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teams/new');
    // Select OpenCode provider
    await page.getByTestId('provider-card-opencode').click();
    // Fill step 1 and proceed
    await page.getByPlaceholder('My Agent Team').fill('opencode-model-test');
    await page.getByRole('button', { name: 'Next' }).click();
    // Add a sub-agent to access model selector
    await page.getByText('+ Add Sub-Agent').click();
  });

  test('should show OpenCode models with optgroups', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    const optgroups = modelSelect.locator('optgroup');

    // Verify all four optgroups
    await expect(optgroups.filter({ hasText: 'Anthropic' })).toBeVisible();
    await expect(optgroups.filter({ hasText: 'OpenAI' })).toBeVisible();
    await expect(optgroups.filter({ hasText: 'Google' })).toBeVisible();
    await expect(optgroups.filter({ hasText: 'Local' })).toBeVisible();
  });

  test('should show Anthropic models under Anthropic optgroup', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    const anthropicGroup = modelSelect.locator('optgroup[label="Anthropic"]');

    await expect(anthropicGroup.locator('option', { hasText: 'Claude Sonnet 4' })).toBeVisible();
    await expect(anthropicGroup.locator('option', { hasText: 'Claude Opus 4' })).toBeVisible();
    await expect(anthropicGroup.locator('option', { hasText: 'Claude Haiku 3.5' })).toBeVisible();
  });

  test('should show OpenAI models under OpenAI optgroup', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    const openaiGroup = modelSelect.locator('optgroup[label="OpenAI"]');

    await expect(openaiGroup.locator('option', { hasText: 'GPT-4o' })).toBeVisible();
    await expect(openaiGroup.locator('option', { hasText: 'o3-mini' })).toBeVisible();
  });

  test('should show Google models under Google optgroup', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    const googleGroup = modelSelect.locator('optgroup[label="Google"]');

    await expect(googleGroup.locator('option', { hasText: 'Gemini 2.5 Pro' })).toBeVisible();
    await expect(googleGroup.locator('option', { hasText: 'Gemini 2.5 Flash' })).toBeVisible();
  });

  test('should show Local models under Local optgroup', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    const localGroup = modelSelect.locator('optgroup[label="Local"]');

    await expect(localGroup.locator('option', { hasText: 'Ollama - Llama 3' })).toBeVisible();
    await expect(localGroup.locator('option', { hasText: 'LM Studio - Default' })).toBeVisible();
  });

  test('should default to Inherit for OpenCode', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    await expect(modelSelect).toHaveValue('inherit');
  });

  test('should allow selecting an OpenCode model with full provider path', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    await modelSelect.selectOption('openai/gpt-4o');
    await expect(modelSelect).toHaveValue('openai/gpt-4o');
  });

  test('should show AGENTS.md label instead of CLAUDE.md for OpenCode', async ({ page }) => {
    await expect(page.getByText('AGENTS.md Content')).toBeVisible();
    await expect(page.getByText('CLAUDE.md Content')).not.toBeVisible();
  });
});

test.describe('Team Creation - Step 3 Review with Provider', () => {
  test('should show Claude provider badge in review', async ({ page }) => {
    await page.goto('/teams/new');
    // Step 1: Claude (default)
    await page.getByPlaceholder('My Agent Team').fill('review-claude-team');
    await page.getByRole('button', { name: 'Next' }).click();
    // Step 2: Leader name
    await page.getByPlaceholder('Agent name').fill('my-leader');
    await page.getByRole('button', { name: 'Next' }).click();
    // Step 3: Review
    await expect(page.getByText('Team Configuration')).toBeVisible();
    await expect(page.getByText('review-claude-team')).toBeVisible();
    // Provider badge should show "Claude"
    await expect(page.getByText('Claude').first()).toBeVisible();
  });

  test('should show OpenCode provider badge in review', async ({ page }) => {
    await page.goto('/teams/new');
    // Step 1: Select OpenCode
    await page.getByTestId('provider-card-opencode').click();
    await page.getByPlaceholder('My Agent Team').fill('review-opencode-team');
    await page.getByRole('button', { name: 'Next' }).click();
    // Step 2: Leader name
    await page.getByPlaceholder('Agent name').fill('oc-leader');
    await page.getByRole('button', { name: 'Next' }).click();
    // Step 3: Review
    await expect(page.getByText('Team Configuration')).toBeVisible();
    await expect(page.getByText('review-opencode-team')).toBeVisible();
    await expect(page.getByText('OpenCode')).toBeVisible();
  });

  test('should include provider in JSON preview for OpenCode', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByPlaceholder('My Agent Team').fill('json-preview-team');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByPlaceholder('Agent name').fill('leader');
    await page.getByRole('button', { name: 'Next' }).click();

    // JSON preview should contain provider: opencode
    const jsonPreview = page.locator('pre').last();
    const json = await jsonPreview.textContent();
    expect(json).toContain('"provider"');
    expect(json).toContain('opencode');
  });

  test('should show OpenCode model in sub-agent preview', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByPlaceholder('My Agent Team').fill('model-preview-team');
    await page.getByRole('button', { name: 'Next' }).click();

    // Configure leader
    const nameInputs = page.getByPlaceholder('Agent name');
    await nameInputs.first().fill('oc-leader');

    // Add sub-agent
    await page.getByText('+ Add Sub-Agent').click();
    await nameInputs.nth(1).fill('oc-worker');
    await page.getByPlaceholder('What does this sub-agent do?').fill('API development');

    // Select OpenCode model
    await page.locator('select').last().selectOption('google/gemini-2.5-pro');

    // Go to review
    await page.getByRole('button', { name: 'Next' }).click();

    // Sub-agent preview should show the OpenCode model
    const preview = page.getByTestId('sub-agent-preview-oc-worker');
    await expect(preview).toBeVisible();
    const previewText = await preview.textContent();
    expect(previewText).toContain('model: google/gemini-2.5-pro');
  });
});

test.describe('Team Creation - Claude Full Flow (Regression)', () => {
  test('creates a Claude team end-to-end', async ({ page }) => {
    // Mock API
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        expect(body.provider).toBeUndefined(); // Claude is default, may not send provider
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdClaudeTeam),
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await page.route('**/api/teams/team-claude-1', (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createdClaudeTeam),
      });
    });

    await page.route('**/api/teams/team-claude-1/messages*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/teams/team-claude-1/activity*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Step 1: Claude selected by default
    await page.goto('/teams/new');
    await expect(page.getByTestId('provider-card-claude')).toHaveClass(/border-blue-500/);
    await page.getByPlaceholder('My Agent Team').fill('claude-e2e-team');
    await page.getByPlaceholder('/path/to/your/project').fill('/tmp/e2e-claude');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Configure leader
    await page.getByPlaceholder('Agent name').fill('claude-leader');
    await expect(page.getByText('CLAUDE.md Content')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Review
    await expect(page.getByText('claude-e2e-team')).toBeVisible();
    await expect(page.getByText('claude-leader')).toBeVisible();

    // Submit
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL('/teams/team-claude-1');
  });
});

test.describe('Team Creation - OpenCode Full Flow', () => {
  test('creates an OpenCode team end-to-end', async ({ page }) => {
    let createPayload: Record<string, unknown> | null = null;

    // Mock API
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'POST') {
        createPayload = route.request().postDataJSON();
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdOpenCodeTeam),
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await page.route('**/api/teams/team-opencode-1', (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createdOpenCodeTeam),
      });
    });

    await page.route('**/api/teams/team-opencode-1/messages*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/teams/team-opencode-1/activity*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Step 1: Select OpenCode
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await expect(page.getByTestId('provider-card-opencode')).toHaveClass(/border-emerald-500/);

    await page.getByPlaceholder('My Agent Team').fill('opencode-e2e-team');
    await page.getByPlaceholder('/path/to/your/project').fill('/tmp/e2e-opencode');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Configure leader + sub-agent
    const nameInputs = page.getByPlaceholder('Agent name');
    await nameInputs.first().fill('opencode-leader');
    await expect(page.getByText('AGENTS.md Content')).toBeVisible();

    // Add a sub-agent with OpenCode model
    await page.getByText('+ Add Sub-Agent').click();
    await nameInputs.nth(1).fill('opencode-worker');
    await page.getByPlaceholder('What does this sub-agent do?').fill('Handles API work');
    await page.locator('select').last().selectOption('openai/gpt-4o');

    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Review
    await expect(page.getByText('opencode-e2e-team')).toBeVisible();
    await expect(page.getByText('opencode-leader')).toBeVisible();
    await expect(page.getByText('opencode-worker')).toBeVisible();
    await expect(page.getByText('OpenCode')).toBeVisible();

    // Submit
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL('/teams/team-opencode-1');

    // Verify the payload sent to the API
    await expect.poll(() => createPayload).toBeTruthy();
    expect(createPayload).toEqual(
      expect.objectContaining({ provider: 'opencode' }),
    );
  });

  test('creates an OpenCode team with Create & Deploy', async ({ page }) => {
    let deployCalled = false;

    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdOpenCodeTeam),
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await page.route('**/api/teams/team-opencode-1/deploy', (route) => {
      deployCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...createdOpenCodeTeam, status: 'deploying' }),
      });
    });

    await page.route('**/api/teams/team-opencode-1', (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/deploy')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...createdOpenCodeTeam, status: 'deploying' }),
      });
    });

    await page.route('**/api/teams/team-opencode-1/messages*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/teams/team-opencode-1/activity*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Fast path through wizard with OpenCode
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByPlaceholder('My Agent Team').fill('opencode-e2e-team');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByPlaceholder('Agent name').fill('opencode-leader');
    await page.getByRole('button', { name: 'Next' }).click();

    // Create & Deploy
    await page.getByRole('button', { name: 'Create & Deploy' }).click();
    await expect(page).toHaveURL('/teams/team-opencode-1');
    expect(deployCalled).toBe(true);
  });
});
