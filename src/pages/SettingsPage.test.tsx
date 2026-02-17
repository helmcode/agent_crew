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
});
