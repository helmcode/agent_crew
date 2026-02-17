import type { TeamStatus, ContainerStatus } from '../types';

const teamStatusColors: Record<TeamStatus, string> = {
  deploying: 'bg-yellow-500/20 text-yellow-400',
  running: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  stopped: 'bg-slate-500/20 text-slate-400',
};

const containerStatusColors: Record<ContainerStatus, string> = {
  running: 'bg-green-500/20 text-green-400',
  stopped: 'bg-slate-500/20 text-slate-400',
  error: 'bg-red-500/20 text-red-400',
};

const dotColors: Record<string, string> = {
  deploying: 'bg-yellow-400',
  running: 'bg-green-400',
  error: 'bg-red-400',
  stopped: 'bg-slate-400',
};

interface StatusBadgeProps {
  status: TeamStatus | ContainerStatus;
  variant?: 'team' | 'container';
}

export function StatusBadge({ status, variant = 'team' }: StatusBadgeProps) {
  const colors = variant === 'team'
    ? teamStatusColors[status as TeamStatus]
    : containerStatusColors[status as ContainerStatus];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColors[status]} ${status === 'running' || status === 'deploying' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}
