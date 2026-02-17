import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Team } from '../types';
import { teamsApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { toast } from '../components/Toast';

export function TeamsListPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchTeams = useCallback(async () => {
    try {
      const data = await teamsApi.list();
      setTeams(data ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
    const interval = setInterval(fetchTeams, 10000);
    return () => clearInterval(interval);
  }, [fetchTeams]);

  async function handleDeploy(id: string) {
    try {
      await teamsApi.deploy(id);
      toast('success', 'Team deployment started');
      fetchTeams();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Deploy failed');
    }
  }

  async function handleStop(id: string) {
    try {
      await teamsApi.stop(id);
      toast('success', 'Team stop initiated');
      fetchTeams();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Stop failed');
    }
  }

  if (loading) return <LoadingSkeleton count={6} />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="mb-4 text-red-400">{error}</p>
        <button onClick={fetchTeams} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
          Retry
        </button>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <EmptyState
        title="No teams yet"
        description="Create your first agent team to get started."
        action={{ label: 'Create Team', onClick: () => navigate('/teams/new') }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Teams</h1>
        <button
          onClick={() => navigate('/teams/new')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Create Team
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <div
            key={team.id}
            className="group rounded-lg border border-slate-700/50 bg-slate-800/50 p-5 transition-all hover:border-slate-600 hover:bg-slate-800"
          >
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-white">{team.name}</h3>
              <StatusBadge status={team.status} />
            </div>
            <p className="mb-4 line-clamp-2 text-sm text-slate-400">
              {team.description || 'No description'}
            </p>
            <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
              <span>{team.agents?.length ?? 0} agents</span>
              <span className="font-mono">{team.runtime === 'kubernetes' ? '☸️' : '🐳'} {team.runtime}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/teams/${team.id}`)}
                className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-600"
              >
                View
              </button>
              {(team.status === 'stopped' || team.status === 'error') && (
                <button
                  onClick={() => handleDeploy(team.id)}
                  className="rounded-md bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-600/30"
                >
                  Deploy
                </button>
              )}
              {(team.status === 'running' || team.status === 'error') && (
                <button
                  onClick={() => handleStop(team.id)}
                  className="rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
