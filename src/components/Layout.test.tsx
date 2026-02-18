import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';

function renderLayout(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Layout />
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  it('hides "New Team" button on teams list page (/)', () => {
    renderLayout('/');
    expect(screen.queryByText('New Team')).not.toBeInTheDocument();
  });

  it('hides "New Team" button on new team page (/teams/new)', () => {
    renderLayout('/teams/new');
    expect(screen.queryByText('New Team')).not.toBeInTheDocument();
  });

  it('shows "New Team" button on settings page', () => {
    renderLayout('/settings');
    const buttons = screen.getAllByText('New Team');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows "New Team" button on team monitor page', () => {
    renderLayout('/teams/some-id');
    const buttons = screen.getAllByText('New Team');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
