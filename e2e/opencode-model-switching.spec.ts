import { test, expect } from '@playwright/test';

/**
 * E2E tests for dynamic model list switching when toggling
 * between Claude and OpenCode providers during team creation.
 * Verifies that model selections reset and dropdown content changes.
 */

test.describe('Model List Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teams/new');
  });

  test('should reset sub-agent models to Inherit when switching from Claude to OpenCode', async ({ page }) => {
    // Step 1: Claude (default)
    await page.getByPlaceholder('My Agent Team').fill('switch-test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Add sub-agent and select Claude model
    await page.getByText('+ Add Sub-Agent').click();
    const modelSelect = page.locator('select').last();
    await modelSelect.selectOption('opus');
    await expect(modelSelect).toHaveValue('opus');

    // Go back to Step 1
    await page.getByRole('button', { name: 'Back' }).click();

    // Switch to OpenCode
    await page.getByTestId('provider-card-opencode').click();

    // Go to Step 2 again
    await page.getByRole('button', { name: 'Next' }).click();

    // Model should be reset to inherit
    const newModelSelect = page.locator('select').last();
    await expect(newModelSelect).toHaveValue('inherit');
  });

  test('should reset sub-agent models to Inherit when switching from OpenCode to Claude', async ({ page }) => {
    // Step 1: Select OpenCode
    await page.getByTestId('provider-card-opencode').click();
    await page.getByPlaceholder('My Agent Team').fill('switch-back-test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Add sub-agent and select OpenCode model
    await page.getByText('+ Add Sub-Agent').click();
    const modelSelect = page.locator('select').last();
    await modelSelect.selectOption('openai/gpt-4o');
    await expect(modelSelect).toHaveValue('openai/gpt-4o');

    // Go back to Step 1
    await page.getByRole('button', { name: 'Back' }).click();

    // Switch to Claude
    await page.getByTestId('provider-card-claude').click();

    // Go to Step 2 again
    await page.getByRole('button', { name: 'Next' }).click();

    // Model should be reset to inherit
    const newModelSelect = page.locator('select').last();
    await expect(newModelSelect).toHaveValue('inherit');
  });

  test('should show optgroups only for OpenCode, not for Claude', async ({ page }) => {
    // Start with Claude (default)
    await page.getByPlaceholder('My Agent Team').fill('optgroup-test');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText('+ Add Sub-Agent').click();

    // Claude: no optgroups
    let modelSelect = page.locator('select').last();
    await expect(modelSelect.locator('optgroup')).toHaveCount(0);

    // Go back and switch to OpenCode
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('provider-card-opencode').click();
    await page.getByRole('button', { name: 'Next' }).click();

    // OpenCode: should have optgroups
    modelSelect = page.locator('select').last();
    const optgroups = modelSelect.locator('optgroup');
    expect(await optgroups.count()).toBeGreaterThanOrEqual(4);
  });

  test('should switch CLAUDE.md label to AGENTS.md when changing provider', async ({ page }) => {
    // Step 1: Claude
    await page.getByPlaceholder('My Agent Team').fill('label-test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Claude shows CLAUDE.md
    await expect(page.getByText('CLAUDE.md Content')).toBeVisible();
    await expect(page.getByText('AGENTS.md Content')).not.toBeVisible();

    // Go back and switch to OpenCode
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('provider-card-opencode').click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: OpenCode shows AGENTS.md
    await expect(page.getByText('AGENTS.md Content')).toBeVisible();
    await expect(page.getByText('CLAUDE.md Content')).not.toBeVisible();
  });

  test('should preserve sub-agent count when switching providers', async ({ page }) => {
    // Add sub-agents with Claude
    await page.getByPlaceholder('My Agent Team').fill('preserve-test');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText('+ Add Sub-Agent').click();
    await expect(page.getByText('Sub-Agent 1')).toBeVisible();

    // Go back and switch to OpenCode
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('provider-card-opencode').click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Sub-agent should still be there
    await expect(page.getByText('Sub-Agent 1')).toBeVisible();
  });

  test('should handle multiple sub-agents model reset on provider switch', async ({ page }) => {
    // Step 1: Claude
    await page.getByPlaceholder('My Agent Team').fill('multi-agent-test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Add two sub-agents with different Claude models
    await page.getByText('+ Add Sub-Agent').click();
    await page.getByText('+ Add Sub-Agent').click();

    const selects = page.locator('select');
    // Select different models for each sub-agent
    await selects.nth(0).selectOption('sonnet');
    await selects.nth(1).selectOption('haiku');

    await expect(selects.nth(0)).toHaveValue('sonnet');
    await expect(selects.nth(1)).toHaveValue('haiku');

    // Go back and switch to OpenCode
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('provider-card-opencode').click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Both should be reset to inherit
    const newSelects = page.locator('select');
    const count = await newSelects.count();
    for (let i = 0; i < count; i++) {
      await expect(newSelects.nth(i)).toHaveValue('inherit');
    }
  });

  test('should keep Claude model options intact when not switching provider', async ({ page }) => {
    // Select Claude model, navigate forward and back — model should persist
    await page.getByPlaceholder('My Agent Team').fill('no-switch-test');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByText('+ Add Sub-Agent').click();
    const modelSelect = page.locator('select').last();
    await modelSelect.selectOption('haiku');
    await expect(modelSelect).toHaveValue('haiku');

    // Fill required fields for step 3
    const nameInputs = page.getByPlaceholder('Agent name');
    await nameInputs.first().fill('my-leader');
    await nameInputs.nth(1).fill('my-worker');
    await page.getByPlaceholder('What does this sub-agent do?').fill('Testing');

    // Go to step 3 and back to step 2
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Back' }).click();

    // Model should still be haiku (no provider switch happened)
    const persistedSelect = page.locator('select').last();
    await expect(persistedSelect).toHaveValue('haiku');
  });
});
