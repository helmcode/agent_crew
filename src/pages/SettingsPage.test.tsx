import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { mockSetting, createFetchMock } from '../test/mocks';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    const { container } = render(<SettingsPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders settings list', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
      expect(screen.getByText('sk-test-123')).toBeInTheDocument();
    });
  });

  it('shows empty state when no settings', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('No settings configured')).toBeInTheDocument();
    });
  });

  it('opens new setting form on Add Setting click', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Setting')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('Add Setting'));
    expect(screen.getByText('New Setting')).toBeInTheDocument();
  });

  it('filters settings by search', async () => {
    const settings = [
      mockSetting,
      { id: 2, key: 'db_host', value: 'localhost', updated_at: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = createFetchMock({ '/api/settings': { body: settings } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Search settings...'), 'db');
    expect(screen.getByText('db_host')).toBeInTheDocument();
    expect(screen.queryByText('api_key')).not.toBeInTheDocument();
  });

  it('shows "No matching settings" when search has no results', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Search settings...'), 'nonexistent_key');
    expect(screen.getByText('No matching settings')).toBeInTheDocument();
  });

  it('saves a new setting', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      if (url.includes('/api/settings') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/settings') && (method === 'PUT' || method === 'POST')) {
        return new Response(JSON.stringify({ id: 1, key: 'new_key', value: 'new_value', updated_at: '2026-01-01T00:00:00Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock;

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Setting')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Add Setting'));
    await userEvent.type(screen.getByPlaceholderText('setting_key'), 'new_key');
    await userEvent.type(screen.getByPlaceholderText('value'), 'new_value');
    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const upsertCall = fetchMock.mock.calls.find((call) => {
        const method = call[1]?.method ?? 'GET';
        return method === 'PUT' || method === 'POST';
      });
      expect(upsertCall).toBeTruthy();
    });
  });

  it('disables save button when key is empty', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Setting')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Add Setting'));
    // Key is empty — Save should be disabled
    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('cancels editing a setting', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Setting')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Add Setting'));
    expect(screen.getByText('New Setting')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Setting')).not.toBeInTheDocument();
  });

  it('opens edit form from context menu', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Menu for api_key'));
    await userEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Setting')).toBeInTheDocument();
    // Key field should be disabled when editing existing
    const keyInput = screen.getByDisplayValue('api_key');
    expect(keyInput).toBeDisabled();
  });

  it('deletes a setting from context menu', async () => {
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

    expect(confirmSpy).toHaveBeenCalledWith('Delete setting "api_key"?');

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

    // No DELETE call should have been made
    const deleteCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'DELETE');
    expect(deleteCall).toBeUndefined();

    confirmSpy.mockRestore();
  });

  it('filters settings by value too', async () => {
    const settings = [
      mockSetting,
      { id: 2, key: 'db_host', value: 'localhost', updated_at: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = createFetchMock({ '/api/settings': { body: settings } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('api_key')).toBeInTheDocument();
    });

    // Search by value
    await userEvent.type(screen.getByPlaceholderText('Search settings...'), 'localhost');
    expect(screen.getByText('db_host')).toBeInTheDocument();
    expect(screen.queryByText('api_key')).not.toBeInTheDocument();
  });
});
