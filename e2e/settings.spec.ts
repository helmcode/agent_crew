import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the settings API
    await page.route('**/api/settings', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, key: 'ANTHROPIC_API_KEY', value: 'sk-ant-***' },
            { id: 2, key: 'NATS_AUTH_TOKEN', value: 'secret-token' },
            { id: 3, key: 'RUNTIME', value: 'docker' },
          ]),
        });
      } else {
        route.continue();
      }
    });
  });

  test('shows settings page heading', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('shows Add Setting button', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Add Setting')).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByPlaceholder('Search settings...')).toBeVisible();
  });

  test('displays settings from API', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('ANTHROPIC_API_KEY')).toBeVisible();
    await expect(page.getByText('NATS_AUTH_TOKEN')).toBeVisible();
    await expect(page.getByText('RUNTIME')).toBeVisible();
  });

  test('displays setting values', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('docker')).toBeVisible();
  });

  test('can filter settings via search', async ({ page }) => {
    await page.goto('/settings');
    const searchInput = page.getByPlaceholder('Search settings...');
    await searchInput.fill('RUNTIME');
    await expect(page.getByText('RUNTIME')).toBeVisible();
    // Other settings should be hidden
    await expect(page.getByText('ANTHROPIC_API_KEY')).not.toBeVisible();
    await expect(page.getByText('NATS_AUTH_TOKEN')).not.toBeVisible();
  });

  test('shows no matching settings for unmatched filter', async ({ page }) => {
    await page.goto('/settings');
    const searchInput = page.getByPlaceholder('Search settings...');
    await searchInput.fill('nonexistent-key-xyz');
    await expect(page.getByText('No matching settings')).toBeVisible();
  });

  test('opens New Setting form on Add Setting click', async ({ page }) => {
    await page.goto('/settings');
    await page.getByText('Add Setting').click();
    await expect(page.getByText('New Setting')).toBeVisible();
    await expect(page.getByPlaceholder('setting_key')).toBeVisible();
    await expect(page.getByPlaceholder('value')).toBeVisible();
  });

  test('shows Save and Cancel buttons in form', async ({ page }) => {
    await page.goto('/settings');
    await page.getByText('Add Setting').click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('Save button is disabled when key is empty', async ({ page }) => {
    await page.goto('/settings');
    await page.getByText('Add Setting').click();
    const saveBtn = page.getByRole('button', { name: 'Save' });
    await expect(saveBtn).toBeDisabled();
  });

  test('Save button is enabled when key has value', async ({ page }) => {
    await page.goto('/settings');
    await page.getByText('Add Setting').click();
    await page.getByPlaceholder('setting_key').fill('NEW_KEY');
    const saveBtn = page.getByRole('button', { name: 'Save' });
    await expect(saveBtn).toBeEnabled();
  });

  test('Cancel closes the form', async ({ page }) => {
    await page.goto('/settings');
    await page.getByText('Add Setting').click();
    await expect(page.getByText('New Setting')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('New Setting')).not.toBeVisible();
  });

  test('key input is editable for new settings', async ({ page }) => {
    await page.goto('/settings');
    await page.getByText('Add Setting').click();
    const keyInput = page.getByPlaceholder('setting_key');
    await keyInput.fill('MY_NEW_KEY');
    await expect(keyInput).toHaveValue('MY_NEW_KEY');
    await expect(keyInput).toBeEnabled();
  });
});

test.describe('Settings Page - empty state', () => {
  test('shows empty state when no settings exist', async ({ page }) => {
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
    await expect(page.getByText('No settings configured')).toBeVisible();
  });
});

test.describe('Settings Page - navigation', () => {
  test('settings page is accessible from nav', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');
  });
});
