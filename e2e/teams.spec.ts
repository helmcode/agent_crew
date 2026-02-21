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
    await page.waitForLoadState('networkidle');
    const emptyState = page.getByText('No teams yet');
    const teamCards = page.locator('[class*="rounded-lg"][class*="border"]');
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

    const nextBtn = page.getByRole('button', { name: 'Next' });
    await expect(nextBtn).toBeDisabled();

    await page.getByPlaceholder('My Agent Team').fill('e2e-test-team');
    await expect(nextBtn).toBeEnabled();
  });

  test('navigates through all 3 steps', async ({ page }) => {
    await page.goto('/teams/new');

    // Step 1: Team Config
    await page.getByPlaceholder('My Agent Team').fill('e2e-test-team');
    await page.getByPlaceholder('/path/to/your/project').fill('/tmp/test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Agents — leader has CLAUDE.md editor
    await expect(page.getByText('Leader Agent')).toBeVisible();
    await expect(page.getByText('CLAUDE.md Content')).toBeVisible();
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

  test('can add and remove sub-agents in step 2', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Add a sub-agent
    await page.getByText('+ Add Sub-Agent').click();
    await expect(page.getByText('Sub-Agent 1')).toBeVisible();
    await expect(page.getByText('Sub-Agent', { exact: true })).toBeVisible();

    // Remove it
    await page.getByText('Remove').click();
    await expect(page.getByText('Sub-Agent 1')).not.toBeVisible();
  });

  test('Cancel navigates back to home', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL('/');
  });

  test('leader agent does not show skills or description fields', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('test');
    await page.getByRole('button', { name: 'Next' }).click();

    // Leader shows CLAUDE.md but NOT skills or description fields
    await expect(page.getByText('CLAUDE.md Content')).toBeVisible();
    await expect(page.getByPlaceholder('Add skill and press Enter')).not.toBeVisible();
    await expect(page.getByPlaceholder('What does this sub-agent do?')).not.toBeVisible();
  });

  test('CLAUDE.md editor has default template', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('test');
    await page.getByRole('button', { name: 'Next' }).click();

    const editor = page.getByPlaceholder('# Agent instructions in Markdown...');
    await expect(editor).toBeVisible();
    const value = await editor.inputValue();
    expect(value).toContain('# Agent:');
    expect(value).toContain('## Role');
  });

  test('CLAUDE.md editor content is editable', async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('test');
    await page.getByRole('button', { name: 'Next' }).click();

    const editor = page.getByPlaceholder('# Agent instructions in Markdown...');
    await editor.clear();
    await editor.fill('# Custom instructions for my agent');
    await expect(editor).toHaveValue('# Custom instructions for my agent');
  });
});

test.describe('Team Builder - Sub-Agent Fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teams/new');
    await page.getByPlaceholder('My Agent Team').fill('test');
    await page.getByRole('button', { name: 'Next' }).click();
    // Add a sub-agent
    await page.getByText('+ Add Sub-Agent').click();
  });

  test('sub-agent shows description, skills, and model fields', async ({ page }) => {
    await expect(page.getByText('Description *')).toBeVisible();
    await expect(page.getByText('Skills')).toBeVisible();
    await expect(page.getByText('Model')).toBeVisible();
  });

  test('sub-agent description is required for Next button', async ({ page }) => {
    // Fill leader name
    const nameInputs = page.getByPlaceholder('Agent name');
    await nameInputs.first().fill('my-leader');
    await nameInputs.nth(1).fill('my-worker');

    // Next should be disabled without sub-agent description
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();

    // Fill description
    await page.getByPlaceholder('What does this sub-agent do?').fill('Handles backend work');
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  test('can add skills by typing and pressing Enter', async ({ page }) => {
    const skillInput = page.getByPlaceholder('Add skill and press Enter');
    await skillInput.fill('@anthropic/tool-bash');
    await skillInput.press('Enter');

    // Skill chip should appear
    await expect(page.getByText('@anthropic/tool-bash')).toBeVisible();
    // Input should be cleared
    await expect(skillInput).toHaveValue('');
  });

  test('can add multiple skills', async ({ page }) => {
    const skillInput = page.getByPlaceholder('Add skill and press Enter');

    await skillInput.fill('@anthropic/tool-bash');
    await skillInput.press('Enter');
    await skillInput.fill('@anthropic/tool-read');
    await skillInput.press('Enter');

    await expect(page.getByText('@anthropic/tool-bash')).toBeVisible();
    await expect(page.getByText('@anthropic/tool-read')).toBeVisible();
  });

  test('can remove a skill by clicking the x button', async ({ page }) => {
    const skillInput = page.getByPlaceholder('Add skill and press Enter');
    await skillInput.fill('test-skill');
    await skillInput.press('Enter');

    await expect(page.getByText('test-skill')).toBeVisible();

    // Click the × button on the skill chip
    const chip = page.locator('span', { hasText: 'test-skill' }).filter({ has: page.locator('button') });
    await chip.locator('button').click();

    await expect(page.getByText('test-skill')).not.toBeVisible();
  });

  test('can add skill with comma key', async ({ page }) => {
    const skillInput = page.getByPlaceholder('Add skill and press Enter');
    await skillInput.fill('comma-skill');
    await skillInput.press(',');

    await expect(page.getByText('comma-skill')).toBeVisible();
  });

  test('removes last skill on Backspace when input is empty', async ({ page }) => {
    const skillInput = page.getByPlaceholder('Add skill and press Enter');
    await skillInput.fill('skill-one');
    await skillInput.press('Enter');
    await skillInput.fill('skill-two');
    await skillInput.press('Enter');

    // Both skills visible
    await expect(page.getByText('skill-one')).toBeVisible();
    await expect(page.getByText('skill-two')).toBeVisible();

    // Press backspace on empty input
    await skillInput.press('Backspace');
    await expect(page.getByText('skill-two')).not.toBeVisible();
    await expect(page.getByText('skill-one')).toBeVisible();
  });

  test('model selector defaults to Inherit', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    await expect(modelSelect).toHaveValue('inherit');
  });

  test('can change model selection', async ({ page }) => {
    const modelSelect = page.locator('select').last();
    await modelSelect.selectOption('sonnet');
    await expect(modelSelect).toHaveValue('sonnet');
  });

  test('sub-agent preview in step 3 shows skills and model', async ({ page }) => {
    // Fill required fields
    const nameInputs = page.getByPlaceholder('Agent name');
    await nameInputs.first().fill('my-leader');
    await nameInputs.nth(1).fill('my-worker');
    await page.getByPlaceholder('What does this sub-agent do?').fill('Backend dev');

    // Add skills
    const skillInput = page.getByPlaceholder('Add skill and press Enter');
    await skillInput.fill('@anthropic/tool-bash');
    await skillInput.press('Enter');

    // Change model
    await page.locator('select').last().selectOption('sonnet');

    // Go to step 3
    await page.getByRole('button', { name: 'Next' }).click();

    // Check sub-agent preview
    const preview = page.getByTestId('sub-agent-preview-my-worker');
    await expect(preview).toBeVisible();
    const previewText = await preview.textContent();
    expect(previewText).toContain('name: my-worker');
    expect(previewText).toContain('description: Backend dev');
    expect(previewText).toContain('model: sonnet');
    expect(previewText).toContain('@anthropic/tool-bash');
  });

  test('JSON preview in step 3 includes sub-agent skills', async ({ page }) => {
    // Fill required fields
    const nameInputs = page.getByPlaceholder('Agent name');
    await nameInputs.first().fill('my-leader');
    await nameInputs.nth(1).fill('my-worker');
    await page.getByPlaceholder('What does this sub-agent do?').fill('Backend dev');

    const skillInput = page.getByPlaceholder('Add skill and press Enter');
    await skillInput.fill('vercel-labs/agent-skills');
    await skillInput.press('Enter');

    // Go to step 3
    await page.getByRole('button', { name: 'Next' }).click();

    // Check JSON preview contains the skill
    const jsonPreview = page.locator('pre').last();
    const json = await jsonPreview.textContent();
    expect(json).toContain('vercel-labs/agent-skills');
    expect(json).toContain('sub_agent_description');
  });
});
