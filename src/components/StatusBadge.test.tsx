import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import type { TeamStatus, ContainerStatus } from '../types';

describe('StatusBadge', () => {
  const teamStatuses: TeamStatus[] = ['stopped', 'deploying', 'running', 'error'];
  const containerStatuses: ContainerStatus[] = ['running', 'stopped', 'error'];

  it.each(teamStatuses)('renders team status "%s"', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it.each(containerStatuses)('renders container status "%s"', (status) => {
    render(<StatusBadge status={status} variant="container" />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('applies pulse animation for running status', () => {
    const { container } = render(<StatusBadge status="running" />);
    const dot = container.querySelector('.animate-pulse');
    expect(dot).toBeInTheDocument();
  });

  it('applies pulse animation for deploying status', () => {
    const { container } = render(<StatusBadge status="deploying" />);
    const dot = container.querySelector('.animate-pulse');
    expect(dot).toBeInTheDocument();
  });

  it('does not apply pulse animation for stopped status', () => {
    const { container } = render(<StatusBadge status="stopped" />);
    const dot = container.querySelector('.animate-pulse');
    expect(dot).not.toBeInTheDocument();
  });
});
