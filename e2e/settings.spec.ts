import { test, expect } from '@playwright/test';

test.describe('Variables Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the settings API with is_secret field
    await page.route('**/api/settings', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, key: 'ANTHROPIC_API_KEY', value: '********', is_secret: true },
            { id: 2, key: 'NATS_AUTH_TOKEN', value: '********', is_secret: true },
            { id: 3, key: 'RUNTIME', value: 'docker', is_secret: false },
          ]),
        });
      } else {
        route.continue();
      }
    });
  });

  test('shows Variables page heading', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Variables' })).toBeVisible();
  });

  test('shows Add Variable button with plus icon', async ({ page }) => {
    await page.goto('/settings');
    const addBtn = page.getByRole('button', { name: 'Add Variable' });
    await expect(addBtn).toBeVisible();
    // Verify SVG plus icon is present inside the button
    const svg = addBtn.locator('svg');
    await expect(svg).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByPlaceholder('Search variables...')).toBeVisible();
  });

  test('displays variables from API', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('ANTHROPIC_API_KEY')).toBeVisible();
    await expect(page.getByText('NATS_AUTH_TOKEN')).toBeVisible();
    await expect(page.getByText('RUNTIME')).toBeVisible();
  });

  test('displays non-secret variable values', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('docker')).toBeVisible();
  });

  test('displays masked dots for secret variables', async ({ page }) => {
    await page.goto('/settings');
    // Secret variables should show dots, not the actual masked value
    const dots = page.getByText('••••••••');
    await expect(dots.first()).toBeVisible();
    // The raw masked value should NOT be displayed
    await expect(page.getByText('********')).not.toBeVisible();
  });

  test('can filter variables via search', async ({ page }) => {
    await page.goto('/settings');
    const searchInput = page.getByPlaceholder('Search variables...');
    await searchInput.fill('RUNTIME');
    await expect(page.getByText('RUNTIME')).toBeVisible();
    // Other variables should be hidden
    await expect(page.getByText('ANTHROPIC_API_KEY')).not.toBeVisible();
    await expect(page.getByText('NATS_AUTH_TOKEN')).not.toBeVisible();
  });

  test('shows no matching variables for unmatched filter', async ({ page }) => {
    await page.goto('/settings');
    const searchInput = page.getByPlaceholder('Search variables...');
    await searchInput.fill('nonexistent-key-xyz');
    await expect(page.getByText('No matching variables')).toBeVisible();
  });

  test('opens New Variable form on Add Variable click', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    await expect(page.getByText('New Variable')).toBeVisible();
    await expect(page.getByPlaceholder('variable_key')).toBeVisible();
    await expect(page.getByPlaceholder('value')).toBeVisible();
  });

  test('shows Save and Cancel buttons in form', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('Save button is disabled when key is empty', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    const saveBtn = page.getByRole('button', { name: 'Save' });
    await expect(saveBtn).toBeDisabled();
  });

  test('Save button is enabled when key has value', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    await page.getByPlaceholder('variable_key').fill('NEW_KEY');
    const saveBtn = page.getByRole('button', { name: 'Save' });
    await expect(saveBtn).toBeEnabled();
  });

  test('Cancel closes the form', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    await expect(page.getByText('New Variable')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('New Variable')).not.toBeVisible();
  });

  test('key input is editable for new variables', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    const keyInput = page.getByPlaceholder('variable_key');
    await keyInput.fill('MY_NEW_KEY');
    await expect(keyInput).toHaveValue('MY_NEW_KEY');
    await expect(keyInput).toBeEnabled();
  });

  test('shows secret toggle in create form', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    const toggle = page.getByRole('switch');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('toggling secret changes input type to password', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();

    // Initially text input
    const valueInput = page.getByPlaceholder('value');
    await expect(valueInput).toHaveAttribute('type', 'text');

    // Toggle secret on
    await page.getByRole('switch').click();

    // Now should be password input with updated placeholder
    const secretInput = page.getByPlaceholder('Enter secret value');
    await expect(secretInput).toHaveAttribute('type', 'password');
  });

  test('sends is_secret flag when creating a secret variable', async ({ page }) => {
    let upsertBody: Record<string, unknown> | null = null;

    await page.route('**/api/settings', (route) => {
      if (route.request().method() === 'PUT') {
        upsertBody = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 4, key: 'MY_SECRET', value: '********', is_secret: true, updated_at: '2026-01-01T00:00:00Z' }),
        });
      } else if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add Variable' }).click();
    await page.getByPlaceholder('variable_key').fill('MY_SECRET');
    await page.getByRole('switch').click();
    await page.getByPlaceholder('Enter secret value').fill('super-secret-value');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => upsertBody).toBeTruthy();
    expect(upsertBody).toEqual(
      expect.objectContaining({ key: 'MY_SECRET', value: 'super-secret-value', is_secret: true }),
    );
  });

  test('editing a secret variable shows empty value input', async ({ page }) => {
    await page.goto('/settings');
    // Click the pencil edit icon for the secret variable
    await page.getByLabel('Edit ANTHROPIC_API_KEY').click();
    await expect(page.getByText('Edit Variable')).toBeVisible();

    // Value input should be empty (never shows actual secret)
    const valueInput = page.getByPlaceholder('Enter secret value');
    await expect(valueInput).toHaveValue('');
    await expect(valueInput).toHaveAttribute('type', 'password');
  });

  test('editing a non-secret variable shows current value', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Edit RUNTIME').click();
    await expect(page.getByText('Edit Variable')).toBeVisible();

    const valueInput = page.getByPlaceholder('value');
    await expect(valueInput).toHaveValue('docker');
    await expect(valueInput).toHaveAttribute('type', 'text');
  });

  test('pencil edit icon is visible on row hover', async ({ page }) => {
    await page.goto('/settings');
    const row = page.getByText('RUNTIME').locator('..');
    // Hover to reveal the edit icon
    await row.hover();
    const editBtn = page.getByLabel('Edit RUNTIME');
    await expect(editBtn).toBeVisible();
  });

  test('does not search by value for secret variables', async ({ page }) => {
    await page.goto('/settings');
    const searchInput = page.getByPlaceholder('Search variables...');
    // Searching the masked value should not match secret variables
    await searchInput.fill('********');
    await expect(page.getByText('ANTHROPIC_API_KEY')).not.toBeVisible();
    await expect(page.getByText('NATS_AUTH_TOKEN')).not.toBeVisible();
  });
});

test.describe('Variables Page - empty state', () => {
  test('shows empty state when no variables exist', async ({ page }) => {
    await page.route('**/api/settings', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings');
    await expect(page.getByText('No variables configured')).toBeVisible();
  });
});

test.describe('Variables Page - navigation', () => {
  test('variables page is accessible from nav', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');
  });

  test('sidebar shows Variables label', async ({ page }) => {
    await page.goto('/');
    // The nav should show "Variables" not "Settings"
    await expect(page.getByRole('link', { name: 'Variables' })).toBeVisible();
  });
});
