import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ToastContainer, toast } from './Toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastContainer', () => {
  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a success toast', () => {
    render(<ToastContainer />);
    act(() => {
      toast('success', 'Team created');
    });
    expect(screen.getByText('Team created')).toBeInTheDocument();
  });

  it('shows an error toast', () => {
    render(<ToastContainer />);
    act(() => {
      toast('error', 'Something went wrong');
    });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows an info toast', () => {
    render(<ToastContainer />);
    act(() => {
      toast('info', 'Deployment started');
    });
    expect(screen.getByText('Deployment started')).toBeInTheDocument();
  });

  it('applies correct color classes for each type', () => {
    render(<ToastContainer />);
    act(() => {
      toast('success', 'green toast');
    });
    const el = screen.getByText('green toast');
    expect(el.className).toContain('text-green-400');

    act(() => {
      toast('error', 'red toast');
    });
    const errEl = screen.getByText('red toast');
    expect(errEl.className).toContain('text-red-400');

    act(() => {
      toast('info', 'blue toast');
    });
    const infoEl = screen.getByText('blue toast');
    expect(infoEl.className).toContain('text-blue-400');
  });

  it('auto-dismisses toast after 4 seconds', () => {
    render(<ToastContainer />);
    act(() => {
      toast('success', 'Temporary message');
    });
    expect(screen.getByText('Temporary message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4100);
    });

    expect(screen.queryByText('Temporary message')).not.toBeInTheDocument();
  });

  it('shows multiple toasts simultaneously', () => {
    render(<ToastContainer />);
    act(() => {
      toast('success', 'First toast');
      toast('error', 'Second toast');
      toast('info', 'Third toast');
    });
    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
    expect(screen.getByText('Third toast')).toBeInTheDocument();
  });

  it('dismisses toasts independently', () => {
    render(<ToastContainer />);
    act(() => {
      toast('success', 'Early toast');
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    act(() => {
      toast('info', 'Late toast');
    });

    // Both should be visible
    expect(screen.getByText('Early toast')).toBeInTheDocument();
    expect(screen.getByText('Late toast')).toBeInTheDocument();

    // Advance 2+ more seconds — first should dismiss (4s total), second stays
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.queryByText('Early toast')).not.toBeInTheDocument();
    expect(screen.getByText('Late toast')).toBeInTheDocument();
  });

  it('does nothing when toast() is called before mount', () => {
    // Call toast before rendering — should not throw
    expect(() => toast('success', 'Orphan toast')).not.toThrow();
  });
});
