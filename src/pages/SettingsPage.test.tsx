import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { mockSetting, createFetchMock } from '../test/mocks';
import type { Setting } from '../types';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    const { container } = render(<SettingsPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders variables list', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
      expect(screen.getByText('sk-test-123')).toBeInTheDocument();
    });
  });

  it('shows empty state when no variables', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('No variables configured')).toBeInTheDocument();
    });
  });

  it('opens new variable form on Variable button click', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Variable' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Variable' }));
    expect(screen.getByText('New Variable')).toBeInTheDocument();
  });

  it('filters variables by search', async () => {
    const settings: Setting[] = [
      mockSetting,
      { id: 2, key: 'db_host', value: 'localhost', is_secret: false, updated_at: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = createFetchMock({ '/api/settings': { body: settings } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Search variables...'), 'db');
    expect(screen.getByText('db_host')).toBeInTheDocument();
    expect(screen.queryByText('api_key')).not.toBeInTheDocument();
  });

  it('shows "No matching variables" when search has no results', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Search variables...'), 'nonexistent_key');
    expect(screen.getByText('No matching variables')).toBeInTheDocument();
  });

  it('saves a new variable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (url.includes('/api/settings') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/settings') && (method === 'PUT' || method === 'POST')) {
        return new Response(JSON.stringify({ id: 1, key: 'new_key', value: 'new_value', is_secret: false, updated_at: '2026-01-01T00:00:00Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Variable' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Variable' }));
    await userEvent.type(screen.getByPlaceholderText('variable_key'), 'new_key');
    await userEvent.type(screen.getByPlaceholderText('value'), 'new_value');
    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const upsertCall = fetchMock.mock.calls.find((call) => {
        const method = call[1]?.method ?? 'GET';
        return method === 'PUT' || method === 'POST';
      });
      expect(upsertCall).toBeTruthy();
      const body = JSON.parse(upsertCall![1]?.body as string);
      expect(body.is_secret).toBe(false);
    });
  });

  it('disables save button when key is empty', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Variable' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Variable' }));
    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('cancels editing a variable', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Variable' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Variable' }));
    expect(screen.getByText('New Variable')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Variable')).not.toBeInTheDocument();
  });

  it('opens edit form from context menu', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Menu for api_key'));
    await userEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Variable')).toBeInTheDocument();
    const keyInput = screen.getByDisplayValue('api_key');
    expect(keyInput).toBeDisabled();
  });

  it('opens edit form from pencil icon', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Edit api_key'));
    expect(screen.getByText('Edit Variable')).toBeInTheDocument();
  });

  it('deletes a variable from context menu', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (url.includes('/api/settings') && method === 'GET') {
        return new Response(JSON.stringify([mockSetting]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Menu for api_key'));
    await userEvent.click(screen.getByText('Delete'));

    expect(confirmSpy).toHaveBeenCalledWith('Delete variable "api_key"?');

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find((call) => {
        return call[1]?.method === 'DELETE';
      });
      expect(deleteCall).toBeTruthy();
    });

    confirmSpy.mockRestore();
  });

  it('does not delete when confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (url.includes('/api/settings') && method === 'GET') {
        return new Response(JSON.stringify([mockSetting]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Menu for api_key'));
    await userEvent.click(screen.getByText('Delete'));

    const deleteCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'DELETE');
    expect(deleteCall).toBeUndefined();

    confirmSpy.mockRestore();
  });

  it('filters variables by value too', async () => {
    const settings: Setting[] = [
      mockSetting,
      { id: 2, key: 'db_host', value: 'localhost', is_secret: false, updated_at: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = createFetchMock({ '/api/settings': { body: settings } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Search variables...'), 'localhost');
    expect(screen.getByText('db_host')).toBeInTheDocument();
    expect(screen.queryByText('api_key')).not.toBeInTheDocument();
  });

  // Obfuscation/secret tests
  it('displays masked value for secret variables', async () => {
    const secretSetting: Setting = {
      id: 2,
      key: 'secret_token',
      value: '********',
      is_secret: true,
      updated_at: '2026-01-01T00:00:00Z',
    };
    global.fetch = createFetchMock({ '/api/settings': { body: [secretSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('secret_token')).toBeInTheDocument();
    });
    expect(screen.getByText('••••••••')).toBeInTheDocument();
    expect(screen.queryByText('********')).not.toBeInTheDocument();
  });

  it('shows empty value input when editing a secret variable', async () => {
    const secretSetting: Setting = {
      id: 2,
      key: 'secret_token',
      value: '********',
      is_secret: true,
      updated_at: '2026-01-01T00:00:00Z',
    };
    global.fetch = createFetchMock({ '/api/settings': { body: [secretSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('secret_token')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Edit secret_token'));
    expect(screen.getByText('Edit Variable')).toBeInTheDocument();

    const valueInput = screen.getByPlaceholderText('Enter secret value');
    expect(valueInput).toHaveValue('');
  });

  it('shows current value when editing a non-secret variable', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Edit api_key'));
    expect(screen.getByDisplayValue('sk-test-123')).toBeInTheDocument();
  });

  it('sends is_secret flag when saving a secret variable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (url.includes('/api/settings') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/settings') && (method === 'PUT' || method === 'POST')) {
        return new Response(JSON.stringify({ id: 1, key: 'my_secret', value: '********', is_secret: true, updated_at: '2026-01-01T00:00:00Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Variable' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Variable' }));
    await userEvent.type(screen.getByPlaceholderText('variable_key'), 'my_secret');

    // Enable secret toggle
    const toggle = screen.getByRole('switch');
    await userEvent.click(toggle);

    await userEvent.type(screen.getByPlaceholderText('Enter secret value'), 'super-secret');
    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const upsertCall = fetchMock.mock.calls.find((call) => {
        const method = call[1]?.method ?? 'GET';
        return method === 'PUT' || method === 'POST';
      });
      expect(upsertCall).toBeTruthy();
      const body = JSON.parse(upsertCall![1]?.body as string);
      expect(body.is_secret).toBe(true);
      expect(body.key).toBe('my_secret');
      expect(body.value).toBe('super-secret');
    });
  });

  it('does not search by value for secret variables', async () => {
    const settings: Setting[] = [
      mockSetting,
      { id: 2, key: 'secret_token', value: '********', is_secret: true, updated_at: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = createFetchMock({ '/api/settings': { body: settings } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    // Searching by the masked value should not match secret variables
    await userEvent.type(screen.getByPlaceholderText('Search variables...'), '********');
    expect(screen.queryByText('secret_token')).not.toBeInTheDocument();
  });

  it('displays page title as Variables', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Variables')).toBeInTheDocument();
    });
  });
});
