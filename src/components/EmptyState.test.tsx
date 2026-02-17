import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No items" description="Nothing to show" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState title="Empty" description="None" action={{ label: 'Create', onClick }} />,
    );
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('calls action onClick when button clicked', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState title="Empty" description="None" action={{ label: 'Create', onClick }} />,
    );
    await userEvent.click(screen.getByText('Create'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render button when no action provided', () => {
    render(<EmptyState title="Empty" description="None" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
