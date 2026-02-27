import { test, expect } from '@playwright/test';

/**
 * E2E tests for provider badges on the teams list page.
 * Verifies that Claude and OpenCode teams display the correct badge
 * styling and that legacy teams without a provider default to Claude.
 */

const claudeTeam = {
  id: 'team-cl-1',
  name: 'my-claude-team',
  description: 'A Claude team',
  status: 'running',
  runtime: 'docker',
  workspace_path: '/tmp/claude',
  provider: 'claude',
  agents: [],
  created_at: '2026-02-27T00:00:00Z',
  updated_at: '2026-02-27T00:00:00Z',
};

const opencodeTeam = {
  id: 'team-oc-1',
  name: 'my-opencode-team',
  description: 'An OpenCode team',
  status: 'running',
  runtime: 'docker',
  workspace_path: '/tmp/opencode',
  provider: 'opencode',
  agents: [],
  created_at: '2026-02-27T01:00:00Z',
  updated_at: '2026-02-27T01:00:00Z',
};

const legacyTeam = {
  id: 'team-legacy-1',
  name: 'legacy-team',
  description: 'A team without provider field',
  status: 'stopped',
  runtime: 'docker',
  workspace_path: '/tmp/legacy',
  // No provider field — should default to Claude
  agents: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

test.describe('Teams List - Provider Badges', () => {
  test('should display Claude badge for Claude teams', async ({ page }) => {
    await page.route('**/api/teams', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([claudeTeam]),
      });
    });

    await page.goto('/');
    await expect(page.getByText('my-claude-team')).toBeVisible();

    // Should show blue "Claude" badge
    const badge = page.locator('span', { hasText: 'Claude' }).filter({ has: page.locator('text=Claude') });
    await expect(badge.first()).toBeVisible();
    await expect(badge.first()).toHaveClass(/bg-blue-500/);
    await expect(badge.first()).toHaveClass(/text-blue-400/);
  });

  test('should display OpenCode badge for OpenCode teams', async ({ page }) => {
    await page.route('**/api/teams', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([opencodeTeam]),
      });
    });

    await page.goto('/');
    await expect(page.getByText('my-opencode-team')).toBeVisible();

    // Should show emerald "OpenCode" badge
    const badge = page.locator('span', { hasText: 'OpenCode' });
    await expect(badge.first()).toBeVisible();
    await expect(badge.first()).toHaveClass(/bg-emerald-500/);
    await expect(badge.first()).toHaveClass(/text-emerald-400/);
  });

  test('should default to Claude badge for teams without provider', async ({ page }) => {
    await page.route('**/api/teams', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([legacyTeam]),
      });
    });

    await page.goto('/');
    await expect(page.getByText('legacy-team')).toBeVisible();

    // Legacy teams without provider should show blue "Claude" badge
    const badge = page.locator('span', { hasText: 'Claude' });
    await expect(badge.first()).toBeVisible();
    await expect(badge.first()).toHaveClass(/bg-blue-500/);
  });

  test('should show both Claude and OpenCode badges when mixed teams exist', async ({ page }) => {
    await page.route('**/api/teams', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([claudeTeam, opencodeTeam]),
      });
    });

    await page.goto('/');
    await expect(page.getByText('my-claude-team')).toBeVisible();
    await expect(page.getByText('my-opencode-team')).toBeVisible();

    // Both badge types should be visible
    const claudeBadge = page.locator('span.rounded-full', { hasText: 'Claude' });
    const opencodeBadge = page.locator('span.rounded-full', { hasText: 'OpenCode' });
    await expect(claudeBadge.first()).toBeVisible();
    await expect(opencodeBadge.first()).toBeVisible();
  });

  test('should show correct badge colors for mixed teams including legacy', async ({ page }) => {
    await page.route('**/api/teams', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([claudeTeam, opencodeTeam, legacyTeam]),
      });
    });

    await page.goto('/');

    // All three teams visible
    await expect(page.getByText('my-claude-team')).toBeVisible();
    await expect(page.getByText('my-opencode-team')).toBeVisible();
    await expect(page.getByText('legacy-team')).toBeVisible();

    // OpenCode badge should appear exactly once
    const opencodeBadges = page.locator('span.rounded-full', { hasText: 'OpenCode' });
    await expect(opencodeBadges).toHaveCount(1);

    // Claude badges: 2 (explicit Claude team + legacy team without provider)
    const claudeBadges = page.locator('span.rounded-full', { hasText: 'Claude' });
    await expect(claudeBadges).toHaveCount(2);
  });
});

test.describe('Teams List - Empty State', () => {
  test('should show empty state with no teams', async ({ page }) => {
    await page.route('**/api/teams', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // No badges should be visible
    const badges = page.locator('span.rounded-full');
    const teamCards = page.locator('[class*="rounded-lg"][class*="border"]').filter({ hasText: /Claude|OpenCode/ });
    // Either empty state or no team cards
    const emptyState = page.getByText('No teams yet');
    await expect(emptyState.or(teamCards.first())).toBeVisible();
  });
});
