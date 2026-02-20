import { test, expect } from '@playwright/test';

test.describe('Team Monitor Page', () => {
  // Use a fake team ID — the page will attempt to load it from the API.
  // These tests validate the UI structure before and after data loads.
  const fakeTeamId = '999';

  test('shows loading spinner initially', async ({ page }) => {
    await page.goto(`/teams/${fakeTeamId}`);
    // The page shows a spinner while fetching the team
    const spinner = page.locator('.animate-spin');
    await expect(spinner).toBeVisible({ timeout: 3000 });
  });

  test('has correct URL structure', async ({ page }) => {
    await page.goto(`/teams/${fakeTeamId}`);
    await expect(page).toHaveURL(`/teams/${fakeTeamId}`);
  });
});

test.describe('Team Monitor - with running team', () => {
  // These tests require a real running team. They use route interception
  // to mock the API responses so they can run without a real backend.

  const teamId = '1';
  const mockTeam = {
    id: 1,
    name: 'test-team',
    description: 'E2E test team',
    status: 'running',
    project_path: '/tmp/test',
    agents: [
      { id: 1, name: 'leader', role: 'leader', container_status: 'running' },
      { id: 2, name: 'worker-1', role: 'worker', container_status: 'running' },
    ],
  };

  test.beforeEach(async ({ page }) => {
    // Intercept API calls
    await page.route('**/api/teams/1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTeam),
      });
    });

    await page.route('**/api/teams/1/messages*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('shows team name and status', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('test-team')).toBeVisible();
  });

  test('shows Chat panel heading', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Chat')).toBeVisible();
  });

  test('shows empty chat placeholder', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('Send a message to the team')).toBeVisible();
  });

  test('shows chat input and Send button', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByPlaceholder('Send a message...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('chat input is enabled for running team', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toBeEnabled();
  });

  test('shows agent roster in top bar', async ({ page }) => {
    await page.goto(`/teams/${teamId}`);
    await expect(page.getByText('leader')).toBeVisible();
    await expect(page.getByText('worker-1')).toBeVisible();
  });

  test('back button navigates to teams list', async ({ page }) => {
    // Also mock the teams list endpoint for navigation
    await page.route('**/api/teams', (route) => {
      if (route.request().method() === 'GET' && !route.request().url().includes('/teams/1')) {
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

test.describe('Team Monitor - stopped team', () => {
  const teamId = '2';
  const stoppedTeam = {
    id: 2,
    name: 'stopped-team',
    description: '',
    status: 'stopped',
    project_path: '/tmp/test',
    agents: [],
  };

  test('chat input is disabled for stopped team', async ({ page }) => {
    await page.route('**/api/teams/2', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stoppedTeam),
      });
    });

    await page.route('**/api/teams/2/messages*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/teams/${teamId}`);
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toBeDisabled();
  });
});
