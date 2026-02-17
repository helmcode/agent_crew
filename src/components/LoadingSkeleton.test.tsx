import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoadingSkeleton } from './LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('renders default 3 skeleton cards', () => {
    const { container } = render(<LoadingSkeleton />);
    const cards = container.querySelectorAll('.animate-pulse');
    expect(cards).toHaveLength(3);
  });

  it('renders specified number of skeleton cards', () => {
    const { container } = render(<LoadingSkeleton count={5} />);
    const cards = container.querySelectorAll('.animate-pulse');
    expect(cards).toHaveLength(5);
  });

  it('renders 1 skeleton card', () => {
    const { container } = render(<LoadingSkeleton count={1} />);
    const cards = container.querySelectorAll('.animate-pulse');
    expect(cards).toHaveLength(1);
  });
});
