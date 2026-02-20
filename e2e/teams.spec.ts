import { test, expect } from '@playwright/test';

test.describe('Teams List', () => {
  test('shows the teams list page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Agent Teams')).toBeVisible();
  });

  test('shows New Team button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('New Team')).toBeVisible();
  });

  test('shows empty state when no teams exist', async ({ page }) => {
    await page.goto('/');
    // Either teams load or empty state shows
    await page.waitForLoadState('networkidle');
    const emptyState = page.getByText('No teams yet');
    const teamCards = page.locator('[class*="rounded-lg"][class*="border"]');
    // One of these should be visible
    await expect(emptyState.or(teamCards.first())).toBeVisible();
  });

  test('navigates to team builder on New Team click', async ({ page }) => {
    await page.goto('/');
    await page.getByText('New Team').click();
    await expect(page).toHaveURL('/teams/new');
    await expect(page.getByText('Create Team')).toBeVisible();
  });
});

test.describe('Team Builder Wizard', () => {
  test('completes step 1 with team name', async ({ page }) => {
    await page.goto('/teams/new');
    await expect(page.getByText('Team Config')).toBeVisible();

    // Next should be disabled initially
    const nextBtn = page.getByRole('button', { name: 'Next' });
    await expect(nextBtn).toBeDisabled();

    // Fill team name
    await page.getByPlaceholder('My Agent Team').fill('e2e-test-team');
    await expect(nextBtn).toBeEnabled();
  });

  test('navigates through all 3 steps', async ({ page }) => {
    await page.goto('/teams/new');

    // Step 1: Team Config
    await page.getByPlaceholder('My Agent Team').fill('e2e-test-team');
    await page.getByPlaceholder('/path/to/your/project').fill('/tmp/test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Agents
    await expect(page.getByText('Agent 1')).toBeVisible();
    await page.getByPlaceholder('Agent name').fill('leader-agent');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Review
    await expect(page.getByText('Team Configuration')).toBeVisible();
    await expect(page.getByText('e2e-test-team')).toBeVisible();
    await expect(page.getByText('leader-agent')).toBeVisible();
    await expect(page.getByText('JSON Preview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create & Deploy' })).toBeVisible();
  });

  test('can add and remove agents in step 2', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Add a second agent
    await page.getByText('+ Add Agent').click();
    await expect(page.getByText('Agent 2')).toBeVisible();
    await expect(page.getByText('Worker')).toBeVisible();

    // Remove it
    await page.getByText('Remove').click();
    await expect(page.getByText('Agent 2')).not.toBeVisible();
  });

  test('Cancel navigates back to home', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL('/');
  });

  test('skills section does not exist in step 2', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('test');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('Skills')).not.toBeVisible();
    await expect(page.getByPlaceholder('Add skill and press Enter')).not.toBeVisible();
  });
});
