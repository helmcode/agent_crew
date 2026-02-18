import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TeamsListPage } from './TeamsListPage';
import { mockTeam, mockRunningTeam, createFetchMock } from '../test/mocks';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  vi.restoreAllMocks();
  mockNavigate.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamsListPage />
    </MemoryRouter>,
  );
}

describe('TeamsListPage', () => {
  it('shows loading skeletons initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows empty state when no teams', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No teams yet')).toBeInTheDocument();
    });
  });

  it('renders team cards', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam, mockRunningTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('test-team')).toBeInTheDocument();
      expect(screen.getByText('running-team')).toBeInTheDocument();
    });
  });

  it('shows error state with retry button', async () => {
    global.fetch = createFetchMock({ '/api/teams': { status: 500, body: 'Server Error' } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('navigates to create team page', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Create Team')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('Create Team'));
    expect(mockNavigate).toHaveBeenCalledWith('/teams/new');
  });

  it('shows deploy button for stopped teams', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Deploy')).toBeInTheDocument();
    });
  });

  it('shows stop button for running teams', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockRunningTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });
  });

  it('navigates to team monitor on card click', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('test-team')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('test-team'));
    expect(mockNavigate).toHaveBeenCalledWith('/teams/team-uuid-1');
  });

  it('shows 3-dot menu on hover and opens dropdown', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('test-team')).toBeInTheDocument();
    });
    const menuButton = screen.getByLabelText('Menu for test-team');
    expect(menuButton).toBeInTheDocument();
    await userEvent.click(menuButton);
    expect(screen.getByText('Delete Team')).toBeInTheDocument();
  });

  it('shows delete confirmation modal', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('test-team')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByLabelText('Menu for test-team'));
    await userEvent.click(screen.getByText('Delete Team'));
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('closes delete modal on cancel', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('test-team')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByLabelText('Menu for test-team'));
    await userEvent.click(screen.getByText('Delete Team'));
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument();
  });

  it('deletes team on confirm', async () => {
    global.fetch = createFetchMock({
      '/api/teams/team-uuid-1': { status: 204, body: null },
      '/api/teams': { body: [mockTeam] },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('test-team')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByLabelText('Menu for test-team'));
    await userEvent.click(screen.getByText('Delete Team'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument();
    });
  });
});
