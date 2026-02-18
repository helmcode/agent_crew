import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Team | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  async function handleDeploy(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await teamsApi.deploy(id);
      toast('success', 'Team deployment started');
      fetchTeams();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Deploy failed');
    }
  }

  async function handleStop(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await teamsApi.stop(id);
      toast('success', 'Team stop initiated');
      fetchTeams();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Stop failed');
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await teamsApi.delete(deleteConfirm.id);
      toast('success', 'Team deleted successfully');
      setDeleteConfirm(null);
      fetchTeams();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed');
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
        action={{ label: 'New Team', onClick: () => navigate('/teams/new') }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Teams</h1>
        <button
          onClick={() => navigate('/teams/new')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Team
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <div
            key={team.id}
            onClick={() => navigate(`/teams/${team.id}`)}
            className="group cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 p-5 transition-all hover:border-slate-600 hover:bg-slate-800"
          >
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-white">{team.name}</h3>
              <div className="flex items-center gap-1">
                <StatusBadge status={team.status} />
                <div className="relative" ref={menuOpen === team.id ? menuRef : undefined}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === team.id ? null : team.id);
                    }}
                    className="rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                    aria-label={`Menu for ${team.name}`}
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  {menuOpen === team.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-lg"
                    >
                      <button
                        onClick={() => {
                          setMenuOpen(null);
                          setDeleteConfirm(team);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Team
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="mb-4 line-clamp-2 text-sm text-slate-400">
              {team.description || 'No description'}
            </p>
            <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
              <span>{team.agents?.length ?? 0} agents</span>
              <span className="font-mono">{team.runtime === 'kubernetes' ? '☸️' : '🐳'} {team.runtime}</span>
            </div>
            <div className="flex items-center gap-2">
              {(team.status === 'stopped' || team.status === 'error') && (
                <button
                  onClick={(e) => handleDeploy(e, team.id)}
                  className="rounded-md bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-600/30"
                >
                  Deploy
                </button>
              )}
              {(team.status === 'running' || team.status === 'error') && (
                <button
                  onClick={(e) => handleStop(e, team.id)}
                  className="rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-white">Delete Team</h2>
            <p className="mb-6 text-sm text-slate-400">
              Are you sure you want to delete <span className="font-medium text-white">{deleteConfirm.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
