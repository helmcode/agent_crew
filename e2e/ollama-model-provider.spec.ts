import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Ollama model provider flow in TeamBuilder.
 * Verifies that when OpenCode is selected, the Ollama card appears alongside
 * Anthropic/OpenAI/Google, shows correct orange styling, filters models with
 * sizes, and produces the correct create payload.
 */

const createdTeam = {
  id: 'team-ollama-1',
  name: 'ollama-team',
  description: '',
  status: 'stopped',
  runtime: 'docker',
  workspace_path: '',
  provider: 'opencode',
  model_provider: 'ollama',
  agents: [
    {
      id: 'agent-ollama-1',
      team_id: 'team-ollama-1',
      name: 'ollama-leader',
      role: 'leader',
      instructions_md: '',
      specialty: '',
      system_prompt: '',
      skills: [],
      permissions: {},
      resources: {},
      container_id: '',
      container_status: 'stopped',
      created_at: '2026-03-23T00:00:00Z',
      updated_at: '2026-03-23T00:00:00Z',
    },
  ],
  created_at: '2026-03-23T00:00:00Z',
  updated_at: '2026-03-23T00:00:00Z',
};

test.describe('Ollama Card Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teams/new');
  });

  test('should show Ollama card alongside others when OpenCode is selected', async ({ page }) => {
    // Claude by default — no model provider cards
    await expect(page.getByTestId('model-provider-card-ollama')).not.toBeVisible();

    // Switch to OpenCode
    await page.getByTestId('provider-card-opencode').click();

    // All four model provider cards should be visible
    await expect(page.getByTestId('model-provider-card-anthropic')).toBeVisible();
    await expect(page.getByTestId('model-provider-card-openai')).toBeVisible();
    await expect(page.getByTestId('model-provider-card-google')).toBeVisible();
    await expect(page.getByTestId('model-provider-card-ollama')).toBeVisible();

    // Verify Ollama card label and subtitle
    await expect(page.getByTestId('model-provider-card-ollama').getByText('Ollama')).toBeVisible();
    await expect(page.getByTestId('model-provider-card-ollama').getByText('Local open-source models. No API key required.')).toBeVisible();
  });

  test('should hide Ollama card when Claude is selected', async ({ page }) => {
    // Switch to OpenCode first
    await page.getByTestId('provider-card-opencode').click();
    await expect(page.getByTestId('model-provider-card-ollama')).toBeVisible();

    // Switch back to Claude
    await page.getByTestId('provider-card-claude').click();
    await expect(page.getByTestId('model-provider-card-ollama')).not.toBeVisible();
  });

  test('should display 4 model provider cards in a 2x2 grid', async ({ page }) => {
    await page.getByTestId('provider-card-opencode').click();

    // Verify all 4 cards are present
    const cards = [
      page.getByTestId('model-provider-card-anthropic'),
      page.getByTestId('model-provider-card-openai'),
      page.getByTestId('model-provider-card-google'),
      page.getByTestId('model-provider-card-ollama'),
    ];

    for (const card of cards) {
      await expect(card).toBeVisible();
    }

    // Verify the parent grid uses grid-cols-2 (2x2 layout)
    const gridContainer = page.getByTestId('model-provider-card-anthropic').locator('..');
    await expect(gridContainer).toHaveClass(/grid-cols-2/);
  });
});

test.describe('Ollama Card Styling', () => {
  test('should have orange styling when selected', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByTestId('model-provider-card-ollama').click();

    const ollamaCard = page.getByTestId('model-provider-card-ollama');
    await expect(ollamaCard).toHaveClass(/border-orange-500/);
    await expect(ollamaCard).toHaveClass(/bg-orange-500\/10/);

    // Title should have orange text
    const title = ollamaCard.locator('h4');
    await expect(title).toHaveClass(/text-orange-400/);
  });

  test('should not have orange styling when not selected', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();

    // Select a different provider
    await page.getByTestId('model-provider-card-anthropic').click();

    const ollamaCard = page.getByTestId('model-provider-card-ollama');
    await expect(ollamaCard).not.toHaveClass(/border-orange-500/);
    await expect(ollamaCard).toHaveClass(/border-slate-700/);
  });
});

test.describe('Ollama Model Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByTestId('model-provider-card-ollama').click();
    await page.getByPlaceholder('My Agent Team').fill('ollama-dropdown-test');
    await page.getByRole('button', { name: 'Next' }).click();
  });

  test('should show 5 Ollama models with sizes in leader dropdown', async ({ page }) => {
    const leaderModelSelect = page.getByTestId('leader-model-select');
    const options = leaderModelSelect.locator('option');

    // Should have Inherit + 5 Ollama models = 6 total
    await expect(options).toHaveCount(6);

    await expect(options.filter({ hasText: 'Inherit (default)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Devstral (~14 GB)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Qwen 3 8B (~5 GB)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Llama 3.3 8B (~5 GB)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Code Llama 13B (~7 GB)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Mistral 7B (~4 GB)' })).toBeVisible();
  });

  test('should NOT show models from other providers', async ({ page }) => {
    const leaderModelSelect = page.getByTestId('leader-model-select');
    const options = leaderModelSelect.locator('option');

    await expect(options.filter({ hasText: 'Claude' })).toHaveCount(0);
    await expect(options.filter({ hasText: 'GPT' })).toHaveCount(0);
    await expect(options.filter({ hasText: 'Gemini' })).toHaveCount(0);
  });

  test('should show Ollama models in sub-agent dropdown too', async ({ page }) => {
    await page.getByText('+ Add Sub-Agent').click();

    const subAgentSelect = page.locator('select').last();
    const options = subAgentSelect.locator('option');

    await expect(options.filter({ hasText: 'Inherit (default)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Devstral (~14 GB)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Mistral 7B (~4 GB)' })).toBeVisible();
    await expect(options.filter({ hasText: 'Claude' })).toHaveCount(0);
  });
});

test.describe('Ollama No Credential Warning', () => {
  test('should show no credential warning when Ollama is selected', async ({ page }) => {
    // Mock settings endpoint to return no keys
    await page.route('**/api/settings', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByTestId('model-provider-card-ollama').click();

    // No warning should appear
    await expect(page.getByTestId('team-credential-warning')).not.toBeVisible();
  });

  test('should show credential warning for Anthropic but not Ollama', async ({ page }) => {
    // Mock settings endpoint to return no keys
    await page.route('**/api/settings', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();

    // Select Anthropic — should show warning (no ANTHROPIC_API_KEY)
    await page.getByTestId('model-provider-card-anthropic').click();
    await expect(page.getByTestId('team-credential-warning')).toBeVisible();
    await expect(page.getByTestId('team-credential-warning')).toContainText('ANTHROPIC_API_KEY');

    // Switch to Ollama — warning should disappear
    await page.getByTestId('model-provider-card-ollama').click();
    await expect(page.getByTestId('team-credential-warning')).not.toBeVisible();
  });
});

test.describe('Ollama Model Reset Behavior', () => {
  test('should reset models to Inherit when switching from Ollama to another provider', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByTestId('model-provider-card-ollama').click();
    await page.getByPlaceholder('My Agent Team').fill('ollama-reset-test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Select an Ollama model on the leader
    const leaderModelSelect = page.getByTestId('leader-model-select');
    await leaderModelSelect.selectOption('ollama/devstral');
    await expect(leaderModelSelect).toHaveValue('ollama/devstral');

    // Go back and switch to Anthropic
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('model-provider-card-anthropic').click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Model should be reset to inherit
    const resetSelect = page.getByTestId('leader-model-select');
    await expect(resetSelect).toHaveValue('inherit');

    // Ollama models should no longer appear
    const options = resetSelect.locator('option');
    await expect(options.filter({ hasText: 'Devstral' })).toHaveCount(0);
    await expect(options.filter({ hasText: 'Claude Sonnet 4.6' })).toBeVisible();
  });

  test('should reset Ollama selection when switching provider to Claude and back', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByTestId('model-provider-card-ollama').click();

    // Verify Ollama is selected (orange border)
    await expect(page.getByTestId('model-provider-card-ollama')).toHaveClass(/border-orange-500/);

    // Switch to Claude and back to OpenCode
    await page.getByTestId('provider-card-claude').click();
    await page.getByTestId('provider-card-opencode').click();

    // Model provider should be reset — no card selected
    await expect(page.getByTestId('model-provider-card-ollama')).not.toHaveClass(/border-orange-500/);
    await expect(page.getByTestId('model-provider-card-anthropic')).not.toHaveClass(/border-blue-500/);
  });
});

test.describe('Ollama in Step 3 Review', () => {
  test('should show model_provider ollama in JSON preview', async ({ page }) => {
    await page.goto('/teams/new');

    // Step 1: OpenCode + Ollama
    await page.getByTestId('provider-card-opencode').click();
    await page.getByTestId('model-provider-card-ollama').click();
    await page.getByPlaceholder('My Agent Team').fill('ollama-review-test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Leader name + select specific Ollama model
    await page.getByPlaceholder('Agent name').fill('ollama-leader');
    const leaderModelSelect = page.getByTestId('leader-model-select');
    await leaderModelSelect.selectOption('ollama/devstral');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Review
    await expect(page.getByText('Team Configuration')).toBeVisible();
    await expect(page.getByText('Model Provider')).toBeVisible();
    await expect(page.getByText('ollama')).toBeVisible();

    // JSON preview should contain model_provider: ollama
    const jsonPreview = page.locator('pre').last();
    const json = await jsonPreview.textContent();
    expect(json).toContain('"model_provider"');
    expect(json).toContain('"ollama"');
    expect(json).toContain('"provider"');
    expect(json).toContain('"opencode"');
  });
});

test.describe('Full Flow — Create Team with Ollama', () => {
  test('creates OpenCode team with Ollama model provider end-to-end', async ({ page }) => {
    let createPayload: Record<string, unknown> | null = null;

    // Mock API
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'POST') {
        createPayload = route.request().postDataJSON();
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTeam),
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await page.route('**/api/teams/team-ollama-1', (route) => {
      if (
        route.request().url().includes('/messages') ||
        route.request().url().includes('/activity') ||
        route.request().url().includes('/chat')
      ) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createdTeam),
      });
    });

    await page.route('**/api/teams/team-ollama-1/messages*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/teams/team-ollama-1/activity*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Step 1: OpenCode + Ollama
    await page.goto('/teams/new');
    await page.getByTestId('provider-card-opencode').click();
    await page.getByTestId('model-provider-card-ollama').click();
    await page.getByPlaceholder('My Agent Team').fill('ollama-team');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Configure leader with specific Ollama model
    await page.getByPlaceholder('Agent name').fill('ollama-leader');
    const leaderModelSelect = page.getByTestId('leader-model-select');
    await leaderModelSelect.selectOption('ollama/devstral');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Review and submit
    await expect(page.getByText('ollama-team')).toBeVisible();
    await expect(page.getByText('OpenCode')).toBeVisible();
    await expect(page.getByText('Model Provider')).toBeVisible();

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL('/teams/team-ollama-1');

    // Verify payload
    await expect.poll(() => createPayload).toBeTruthy();
    expect(createPayload).toEqual(
      expect.objectContaining({
        provider: 'opencode',
        model_provider: 'ollama',
      }),
    );
    // Verify the leader has the selected Ollama model
    const agents = (createPayload as Record<string, unknown>).agents as Array<Record<string, unknown>>;
    expect(agents[0].sub_agent_model).toBe('ollama/devstral');
  });
});
