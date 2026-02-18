import type {
  Team,
  Agent,
  TaskLog,
  Setting,
  CreateTeamRequest,
  UpdateTeamRequest,
  CreateAgentRequest,
  UpdateAgentRequest,
  ChatRequest,
  ChatResponse,
  UpdateSettingsRequest,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `Request failed: ${res.status}`;
    if (body) {
      try {
        const json = JSON.parse(body);
        message = json.error || json.message || body;
      } catch {
        message = body;
      }
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Teams
export const teamsApi = {
  list: () => request<Team[]>('/api/teams'),
  get: (id: string) => request<Team>(`/api/teams/${id}`),
  create: (data: CreateTeamRequest) =>
    request<Team>('/api/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateTeamRequest) =>
    request<Team>(`/api/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/api/teams/${id}`, { method: 'DELETE' }),
  deploy: (id: string) =>
    request<Team>(`/api/teams/${id}/deploy`, { method: 'POST' }),
  stop: (id: string) =>
    request<Team>(`/api/teams/${id}/stop`, { method: 'POST' }),
};

// Agents
export const agentsApi = {
  list: (teamId: string) =>
    request<Agent[]>(`/api/teams/${teamId}/agents`),
  get: (teamId: string, agentId: string) =>
    request<Agent>(`/api/teams/${teamId}/agents/${agentId}`),
  create: (teamId: string, data: CreateAgentRequest) =>
    request<Agent>(`/api/teams/${teamId}/agents`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (teamId: string, agentId: string, data: UpdateAgentRequest) =>
    request<Agent>(`/api/teams/${teamId}/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (teamId: string, agentId: string) =>
    request<void>(`/api/teams/${teamId}/agents/${agentId}`, {
      method: 'DELETE',
    }),
};

// Chat & Messages
export const chatApi = {
  send: (teamId: string, data: ChatRequest) =>
    request<ChatResponse>(`/api/teams/${teamId}/chat`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const messagesApi = {
  list: (teamId: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    return request<TaskLog[]>(`/api/teams/${teamId}/messages?${params}`);
  },
};

// Settings
export const settingsApi = {
  list: () => request<Setting[]>('/api/settings'),
  upsert: (data: UpdateSettingsRequest) =>
    request<Setting>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
