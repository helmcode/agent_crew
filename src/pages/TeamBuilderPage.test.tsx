import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TeamBuilderPage } from './TeamBuilderPage';
import { mockTeam } from '../test/mocks';

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
      <TeamBuilderPage />
    </MemoryRouter>,
  );
}

describe('TeamBuilderPage', () => {
  it('renders step 1 by default', () => {
    renderPage();
    expect(screen.getByText('Team Config')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Agent Team')).toBeInTheDocument();
  });

  it('disables Next when team name is empty', () => {
    renderPage();
    const nextBtn = screen.getByText('Next');
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next when team name is filled', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('navigates to step 2 on Next', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
  });

  it('can add and remove agents in step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.click(screen.getByText('+ Add Agent'));
    expect(screen.getByText('Agent 2')).toBeInTheDocument();

    const removeButtons = screen.getAllByText('Remove');
    await userEvent.click(removeButtons[0]);
    expect(screen.queryByText('Agent 2')).not.toBeInTheDocument();
  });

  it('goes back from step 2 to step 1', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'test');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Back'));
    expect(screen.getByPlaceholderText('My Agent Team')).toBeInTheDocument();
  });

  it('shows review in step 3', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));

    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Team Configuration')).toBeInTheDocument();
    expect(screen.getByText('my-team')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Create & Deploy')).toBeInTheDocument();
  });

  it('creates team on submit', async () => {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';

      if (method === 'POST' && url.endsWith('/api/teams')) {
        return new Response(JSON.stringify(mockTeam), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderPage();
    await userEvent.type(screen.getByPlaceholderText('My Agent Team'), 'my-team');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'leader');
    await userEvent.click(screen.getByText('Next'));
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/teams/team-uuid-1');
    });
  });

  it('navigates home on Cancel', async () => {
    renderPage();
    await userEvent.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
