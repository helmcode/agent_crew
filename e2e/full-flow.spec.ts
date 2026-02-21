import { test, expect } from '@playwright/test';

/**
 * Full user flow E2E tests.
 *
 * These tests validate the complete lifecycle: create team -> review ->
 * navigate to monitor -> chat with the team. All API calls are intercepted
 * with route mocking so no backend is required.
 */

const createdTeam = {
  id: 'team-new-1',
  name: 'flow-test-team',
  description: 'Created via E2E flow',
  status: 'stopped',
  runtime: 'docker',
  workspace_path: '/tmp/e2e',
  agents: [
    {
      id: 'agent-new-1',
      team_id: 'team-new-1',
      name: 'my-leader',
      role: 'leader',
      claude_md: '# My Leader',
      specialty: '',
      system_prompt: '',
      skills: [],
      permissions: {},
      resources: {},
      container_id: '',
      container_status: 'stopped',
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-01-15T00:00:00Z',
    },
    {
      id: 'agent-new-2',
      team_id: 'team-new-1',
      name: 'my-worker',
      role: 'worker',
      claude_md: '',
      specialty: '',
      system_prompt: '',
      skills: [],
      sub_agent_description: 'Handles backend development',
      sub_agent_skills: ['@anthropic/tool-bash'],
      sub_agent_model: 'sonnet',
      permissions: {},
      resources: {},
      container_id: '',
      container_status: 'stopped',
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-01-15T00:00:00Z',
    },
  ],
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
};

const deployingTeam = { ...createdTeam, status: 'deploying' };
const runningTeam = {
  ...createdTeam,
  status: 'running',
  agents: createdTeam.agents.map((a) => ({ ...a, container_status: 'running' })),
};

test.describe('Full flow: Create team', () => {
  test('creates a team through the wizard and lands on monitor', async ({ page }) => {
    // Mock the create API
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTeam),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    // Mock the monitor page endpoints (will be hit after redirect)
    await page.route('**/api/teams/team-new-1', (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createdTeam),
      });
    });

    await page.route('**/api/teams/team-new-1/messages*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/teams/team-new-1/activity*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Step 1: Team Config
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('flow-test-team');
    await page.getByPlaceholder('What does this team do?').fill('Created via E2E flow');
    await page.getByPlaceholder('/path/to/your/project').fill('/tmp/e2e');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Configure agents
    const nameInputs = page.getByPlaceholder('Agent name');
    await nameInputs.first().fill('my-leader');

    // Add a sub-agent
    await page.getByText('+ Add Sub-Agent').click();
    await nameInputs.nth(1).fill('my-worker');
    await page.getByPlaceholder('What does this sub-agent do?').fill('Handles backend development');

    // Add a skill
    const skillInput = page.getByPlaceholder('Add skill and press Enter');
    await skillInput.fill('@anthropic/tool-bash');
    await skillInput.press('Enter');

    // Select model
    await page.locator('select').last().selectOption('sonnet');

    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Review — verify all data
    await expect(page.getByText('flow-test-team')).toBeVisible();
    await expect(page.getByText('my-leader')).toBeVisible();
    await expect(page.getByText('my-worker')).toBeVisible();

    // Click Create (not deploy)
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Should redirect to monitor page
    await expect(page).toHaveURL('/teams/team-new-1');
    await expect(page.getByText('flow-test-team')).toBeVisible();
  });
});

test.describe('Full flow: Create & Deploy', () => {
  test('creates and deploys a team in one step', async ({ page }) => {
    let deployCalled = false;

    // Mock create
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTeam),
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    // Mock deploy
    await page.route('**/api/teams/team-new-1/deploy', (route) => {
      deployCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(deployingTeam),
      });
    });

    // Mock monitor endpoints
    await page.route('**/api/teams/team-new-1', (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/deploy')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(deployingTeam),
      });
    });

    await page.route('**/api/teams/team-new-1/messages*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/teams/team-new-1/activity*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Fast path through wizard
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('flow-test-team');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByPlaceholder('Agent name').fill('my-leader');
    await page.getByRole('button', { name: 'Next' }).click();

    // Click Create & Deploy
    await page.getByRole('button', { name: 'Create & Deploy' }).click();

    // Should redirect to monitor
    await expect(page).toHaveURL('/teams/team-new-1');
    expect(deployCalled).toBe(true);
  });
});

test.describe('Full flow: Chat interaction', () => {
  const teamId = 'team-new-1';

  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(runningTeam),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route(`**/api/teams/${teamId}/chat`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'queued', message: 'Message sent to team leader' }),
      });
    });
  });

  test('full chat cycle: send message -> optimistic update -> thinking indicator', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);

    // Verify running state
    await expect(page.getByPlaceholder('Send a message...')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();

    // Send a message
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Build the API endpoints');
    await page.getByRole('button', { name: 'Send' }).click();

    // Optimistic message appears immediately
    await expect(page.getByText('Build the API endpoints')).toBeVisible();

    // Input is cleared
    await expect(input).toHaveValue('');

    // Thinking indicator appears
    await expect(page.getByText('Thinking...')).toBeVisible();
  });

  test('multiple messages appear in order', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const input = page.getByPlaceholder('Send a message...');

    await input.fill('First message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('First message')).toBeVisible();

    await input.fill('Second message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Second message')).toBeVisible();

    // Both messages should be visible in the chat panel
    const chatPanel = page.getByTestId('chat-messages');
    await expect(chatPanel.getByText('First message')).toBeVisible();
    await expect(chatPanel.getByText('Second message')).toBeVisible();
  });

  test('chat send failure restores message to input', async ({ page }) => {
    // Override chat route to fail
    await page.route(`**/api/teams/${teamId}/chat`, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto(`/teams/${teamId}`);
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('This will fail');
    await page.getByRole('button', { name: 'Send' }).click();

    // On failure, message should be restored to input
    await expect(input).toHaveValue('This will fail');
  });
});

test.describe('Full flow: Monitor with history', () => {
  const teamId = 'team-new-1';

  const existingMessages = [
    {
      id: 'hist-1',
      team_id: teamId,
      message_id: 'mid-h-1',
      from_agent: 'user',
      to_agent: 'leader',
      message_type: 'user_message',
      payload: { content: 'Write the login page' },
      created_at: '2026-01-15T10:00:00Z',
    },
    {
      id: 'hist-2',
      team_id: teamId,
      message_id: 'mid-h-2',
      from_agent: 'my-leader',
      to_agent: 'user',
      message_type: 'agent_response',
      payload: { content: 'I will coordinate the team to build the login page.' },
      created_at: '2026-01-15T10:00:05Z',
    },
    {
      id: 'hist-3',
      team_id: teamId,
      message_id: 'mid-h-3',
      from_agent: 'my-leader',
      to_agent: 'user',
      message_type: 'task_result',
      payload: { result: 'Login page implemented successfully with form validation.' },
      created_at: '2026-01-15T10:05:00Z',
    },
  ];

  test('loads all previous messages immediately on page entry', async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(runningTeam),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(existingMessages),
      });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto(`/teams/${teamId}`);

    // ALL messages load immediately — no lazy or incremental loading
    await expect(page.getByText('Write the login page')).toBeVisible();
    await expect(page.getByText('I will coordinate the team to build the login page.')).toBeVisible();
    await expect(page.getByText('Login page implemented successfully with form validation.')).toBeVisible();

    // No empty state placeholder
    await expect(page.getByText('Send a message to the team')).not.toBeVisible();
  });

  test('can send new message after viewing history', async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(runningTeam),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(existingMessages),
      });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route(`**/api/teams/${teamId}/chat`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'queued', message: 'Message sent' }),
      });
    });

    await page.goto(`/teams/${teamId}`);

    // History is loaded
    await expect(page.getByText('Write the login page')).toBeVisible();

    // Send a new message
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Now add unit tests');
    await page.getByRole('button', { name: 'Send' }).click();

    // New message joins the existing history
    await expect(page.getByText('Now add unit tests')).toBeVisible();
    // Old messages still visible
    await expect(page.getByText('Write the login page')).toBeVisible();
  });
});

test.describe('Full flow: Navigation between pages', () => {
  test('navigates from teams list to builder to monitor and back', async ({ page }) => {
    // Mock teams list
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTeam),
        });
      } else if (route.request().method() === 'GET' && !route.request().url().includes('/teams/team-new-1')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([createdTeam]),
        });
      } else {
        route.continue();
      }
    });

    await page.route('**/api/teams/team-new-1', (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createdTeam),
      });
    });

    await page.route('**/api/teams/team-new-1/messages*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/teams/team-new-1/activity*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // 1. Start at teams list
    await page.goto('/');
    await expect(page.getByText('Agent Teams')).toBeVisible();

    // 2. Go to builder
    await page.getByText('New Team').click();
    await expect(page).toHaveURL('/teams/new');

    // 3. Create team through wizard
    await page.getByPlaceholder('My Agent Team').fill('flow-test-team');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByPlaceholder('Agent name').fill('my-leader');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // 4. Lands on monitor
    await expect(page).toHaveURL('/teams/team-new-1');
    await expect(page.getByText('flow-test-team')).toBeVisible();

    // 5. Navigate back to teams list
    await page.getByText('Teams').click();
    await expect(page).toHaveURL('/');
  });
});
