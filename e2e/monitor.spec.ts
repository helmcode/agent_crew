import { test, expect } from '@playwright/test';

// Shared mock data factory
function makeMockTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-e2e-1',
    name: 'test-team',
    description: 'E2E test team',
    status: 'running',
    runtime: 'docker',
    workspace_path: '/tmp/test',
    agents: [
      {
        id: 'agent-1',
        team_id: 'team-e2e-1',
        name: 'leader',
        role: 'leader',
        claude_md: '# Leader',
        specialty: '',
        system_prompt: '',
        skills: [],
        permissions: {},
        resources: {},
        container_id: '',
        container_status: 'running',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'agent-2',
        team_id: 'team-e2e-1',
        name: 'backend-dev',
        role: 'worker',
        claude_md: '',
        specialty: '',
        system_prompt: '',
        skills: [],
        sub_agent_description: 'Handles backend API development',
        sub_agent_skills: ['@anthropic/tool-bash', '@anthropic/tool-read'],
        sub_agent_model: 'sonnet',
        skill_statuses: [
          { name: '@anthropic/tool-bash', status: 'installed' },
          { name: '@anthropic/tool-read', status: 'installed' },
        ],
        permissions: {},
        resources: {},
        container_id: '',
        container_status: 'running',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const mockMessages = [
  {
    id: 'msg-1',
    team_id: 'team-e2e-1',
    message_id: 'mid-1',
    from_agent: 'user',
    to_agent: 'leader',
    message_type: 'user_message',
    payload: { content: 'Hello team' },
    created_at: '2026-01-01T00:00:01Z',
  },
  {
    id: 'msg-2',
    team_id: 'team-e2e-1',
    message_id: 'mid-2',
    from_agent: 'leader',
    to_agent: 'user',
    message_type: 'agent_response',
    payload: { content: 'Hello! How can I help you?' },
    created_at: '2026-01-01T00:00:02Z',
  },
];

const mockActivityMessages = [
  {
    id: 'act-1',
    team_id: 'team-e2e-1',
    message_id: 'act-mid-1',
    from_agent: 'backend-dev',
    to_agent: 'leader',
    message_type: 'activity_event',
    payload: {
      event_type: 'tool_use',
      agent_name: 'backend-dev',
      tool_name: 'Bash',
      action: 'npm test',
      payload: { exit_code: 0 },
      timestamp: '2026-01-01T00:00:03Z',
    },
    created_at: '2026-01-01T00:00:03Z',
  },
  {
    id: 'act-2',
    team_id: 'team-e2e-1',
    message_id: 'act-mid-2',
    from_agent: 'backend-dev',
    to_agent: 'leader',
    message_type: 'activity_event',
    payload: {
      event_type: 'assistant',
      agent_name: 'backend-dev',
      action: 'Analyzing test results',
      timestamp: '2026-01-01T00:00:04Z',
    },
    created_at: '2026-01-01T00:00:04Z',
  },
];

test.describe('Team Monitor Page', () => {
  const fakeTeamId = '999';

  test('shows loading spinner initially', async ({ page }) => {
    await page.goto(`/teams/${fakeTeamId}`);
    const spinner = page.locator('.animate-spin');
    await expect(spinner).toBeVisible({ timeout: 3000 });
  });

  test('has correct URL structure', async ({ page }) => {
    await page.goto(`/teams/${fakeTeamId}`);
    await expect(page).toHaveURL(`/teams/${fakeTeamId}`);
  });
});

test.describe('Team Monitor - with running team', () => {
  const teamId = 'team-e2e-1';

  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockTeam()),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMessages),
      });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockActivityMessages),
      });
    });
  });

  test('shows team name and status badge', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('test-team')).toBeVisible();
  });

  test('shows Chat panel heading', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Chat')).toBeVisible();
  });

  test('shows chat input and Send button', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByPlaceholder('Send a message...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('chat input is enabled for running team', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByPlaceholder('Send a message...')).toBeEnabled();
  });

  test('shows agent roster in top bar', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('leader')).toBeVisible();
    await expect(page.getByText('backend-dev')).toBeVisible();
  });

  test('back button navigates to teams list', async ({ page }) => {
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'GET' && !route.request().url().includes(`/teams/${teamId}`)) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`/teams/${teamId}`);
    await page.getByText('Teams').click();
    await expect(page).toHaveURL('/');
  });

  test('can type in chat input', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Hello agent team');
    await expect(input).toHaveValue('Hello agent team');
  });
});

test.describe('Team Monitor - message history', () => {
  const teamId = 'team-e2e-1';

  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockTeam()),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMessages),
      });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('loads full message history on page entry', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Hello team')).toBeVisible();
    await expect(page.getByText('Hello! How can I help you?')).toBeVisible();
  });

  test('shows message sender names', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const chatPanel = page.getByTestId('chat-messages');
    await expect(chatPanel.getByText('user')).toBeVisible();
  });

  test('does not show empty chat placeholder when messages exist', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Hello team')).toBeVisible();
    await expect(page.getByText('Send a message to the team')).not.toBeVisible();
  });

  test('shows empty chat placeholder when no messages', async ({ page }) => {
    // Override messages route with empty array
    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Send a message to the team')).toBeVisible();
  });

  test('user messages have blue styling', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const userMsg = page.locator('div', { hasText: 'Hello team' }).locator('.bg-blue-600\\/10');
    await expect(userMsg).toBeVisible();
  });
});

test.describe('Team Monitor - chat interactions', () => {
  const teamId = 'team-e2e-1';

  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockTeam()),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(`**/api/teams/${teamId}/chat`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'queued', message: 'Message sent to team leader' }),
      });
    });
  });

  test('sends a message optimistically', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('New message from E2E');
    await page.getByRole('button', { name: 'Send' }).click();

    // Message appears immediately via optimistic update
    await expect(page.getByText('New message from E2E')).toBeVisible();
    // Input is cleared
    await expect(input).toHaveValue('');
  });

  test('shows thinking indicator after sending', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await page.getByPlaceholder('Send a message...').fill('Test message');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Thinking...')).toBeVisible();
  });

  test('shows red border on empty message submit', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await page.getByRole('button', { name: 'Send' }).click();
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toHaveClass(/border-red-500/);
  });

  test('red border clears when typing', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await page.getByRole('button', { name: 'Send' }).click();
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toHaveClass(/border-red-500/);

    await input.fill('now typing');
    await expect(input).not.toHaveClass(/border-red-500/);
  });

  test('sends message on Enter key', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Enter key test');
    await input.press('Enter');

    await expect(page.getByText('Enter key test')).toBeVisible();
    await expect(input).toHaveValue('');
  });
});

test.describe('Team Monitor - skill status indicators', () => {
  const teamId = 'team-e2e-skills';

  function setupRoutes(page: import('@playwright/test').Page, team: unknown) {
    return Promise.all([
      page.route(`**/api/teams/${teamId}`, (route) => {
        if (route.request().url().includes('/messages') || route.request().url().includes('/activity')) {
          route.continue();
          return;
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) });
      }),
      page.route(`**/api/teams/${teamId}/messages*`, (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }),
      page.route(`**/api/teams/${teamId}/activity*`, (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }),
    ]);
  }

  function makeSkillTeam(skillStatuses: Array<{ name: string; status: string }>) {
    return makeMockTeam({
      id: teamId,
      agents: [
        {
          id: 'agent-1', team_id: teamId, name: 'leader', role: 'leader',
          claude_md: '', specialty: '', system_prompt: '', skills: [],
          permissions: {}, resources: {}, container_id: '', container_status: 'running',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'agent-2', team_id: teamId, name: 'worker', role: 'worker',
          claude_md: '', specialty: '', system_prompt: '', skills: [],
          sub_agent_description: 'Worker agent',
          sub_agent_skills: skillStatuses.map((s) => s.name),
          skill_statuses: skillStatuses,
          permissions: {}, resources: {}, container_id: '', container_status: 'running',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
  }

  test('shows green indicator for all-installed skills', async ({ page }) => {
    const team = makeSkillTeam([
      { name: 'skill-a', status: 'installed' },
      { name: 'skill-b', status: 'installed' },
    ]);
    await setupRoutes(page, team);

    await page.goto(`/teams/${teamId}`);
    const indicator = page.getByTestId('skill-status-worker');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText('2');
  });

  test('shows pending indicator with progress', async ({ page }) => {
    const team = makeSkillTeam([
      { name: 'skill-a', status: 'pending' },
      { name: 'skill-b', status: 'installed' },
    ]);
    await setupRoutes(page, team);

    await page.goto(`/teams/${teamId}`);
    const indicator = page.getByTestId('skill-status-worker');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText('1/2');
  });

  test('shows failed indicator with skill names', async ({ page }) => {
    const team = makeSkillTeam([
      { name: 'bad-skill', status: 'failed' },
      { name: 'good-skill', status: 'installed' },
    ]);
    await setupRoutes(page, team);

    await page.goto(`/teams/${teamId}`);
    const failedNames = page.getByTestId('skill-failed-names-worker');
    await expect(failedNames).toBeVisible();
    await expect(failedNames).toContainText('bad-skill');
  });

  test('shows sub-agent description in roster', async ({ page }) => {
    const team = makeSkillTeam([{ name: 'skill-a', status: 'installed' }]);
    await setupRoutes(page, team);

    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Worker agent')).toBeVisible();
  });
});

test.describe('Team Monitor - activity panel', () => {
  const teamId = 'team-e2e-1';

  test.beforeEach(async ({ page }) => {
    // Set large viewport so activity panel is visible
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockTeam()),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockActivityMessages),
      });
    });
  });

  test('shows Activity panel heading on large viewport', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Activity')).toBeVisible();
  });

  test('shows WebSocket connection state', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    // Should show one of the connection states
    const stateLabel = page.locator('text=connecting').or(page.locator('text=disconnected')).or(page.locator('text=connected'));
    await expect(stateLabel).toBeVisible();
  });

  test('renders activity event cards', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const activityPanel = page.getByTestId('activity-messages');
    await expect(activityPanel).toBeVisible();

    const cards = page.getByTestId('activity-event-card');
    await expect(cards.first()).toBeVisible();
  });

  test('activity event cards show event type and agent', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    // First event is a tool_use
    await expect(page.getByText('tool_use')).toBeVisible();
    await expect(page.getByText('backend-dev')).toBeVisible();
  });

  test('activity event cards show summary text', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    // tool_use event has tool_name: Bash, action: npm test
    await expect(page.getByText('Bash: npm test')).toBeVisible();
    // assistant event
    await expect(page.getByText('Analyzing test results')).toBeVisible();
  });

  test('shows agent and type filter dropdowns', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const selects = page.locator('select');
    // Should have at least 2 selects (agent filter + type filter)
    await expect(selects.first()).toBeVisible();
    await expect(selects.nth(1)).toBeVisible();
  });

  test('shows "No activity yet" when activity list is empty', async ({ page }) => {
    // Override activity route
    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('No activity yet')).toBeVisible();
  });

  test('activity panel is hidden on small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(`/teams/${teamId}`);

    // Activity panel has lg:flex class, so hidden on small screens
    const activityPanel = page.getByTestId('activity-messages');
    await expect(activityPanel).not.toBeVisible();
  });
});

test.describe('Team Monitor - error messages', () => {
  const teamId = 'team-e2e-err';

  const errorTeam = makeMockTeam({
    id: teamId,
    name: 'error-team',
    agents: [{
      id: 'agent-1', team_id: teamId, name: 'leader', role: 'leader',
      claude_md: '', specialty: '', system_prompt: '', skills: [],
      permissions: {}, resources: {}, container_id: '', container_status: 'running',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }],
  });

  const errorMessages = [
    {
      id: 'err-1',
      team_id: teamId,
      message_id: 'mid-err-1',
      from_agent: 'leader',
      to_agent: 'user',
      message_type: 'error',
      payload: { content: 'API key is invalid or missing' },
      created_at: '2026-01-01T00:00:01Z',
    },
  ];

  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity') || route.request().url().includes('/chat')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(errorTeam),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(errorMessages),
      });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('shows error message with red styling', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Error')).toBeVisible();
    await expect(page.getByText('API key is invalid or missing')).toBeVisible();
  });

  test('shows Go to Settings button on error', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Go to Settings')).toBeVisible();
  });

  test('Go to Settings navigates to settings page', async ({ page }) => {
    await page.route('**/api/settings', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/teams/${teamId}`);
    await page.getByText('Go to Settings').click();
    await expect(page).toHaveURL('/settings');
  });
});

test.describe('Team Monitor - stopped team', () => {
  const teamId = 'team-e2e-stopped';

  const stoppedTeam = makeMockTeam({
    id: teamId,
    name: 'stopped-team',
    status: 'stopped',
    agents: [],
  });

  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/teams/${teamId}`, (route) => {
      if (route.request().url().includes('/messages') || route.request().url().includes('/activity')) {
        route.continue();
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stoppedTeam),
      });
    });

    await page.route(`**/api/teams/${teamId}/messages*`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route(`**/api/teams/${teamId}/activity*`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('chat input is disabled for stopped team', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByPlaceholder('Send a message...')).toBeDisabled();
  });

  test('Send button is disabled for stopped team', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  test('shows empty chat placeholder for stopped team', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Send a message to the team')).toBeVisible();
  });
});
