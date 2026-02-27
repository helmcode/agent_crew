import type {
  Team,
  Agent,
  AgentInstructions,
  TaskLog,
  Setting,
  CreateTeamRequest,
  UpdateTeamRequest,
  CreateAgentRequest,
  UpdateAgentRequest,
  ChatRequest,
  ChatResponse,
  UpdateSettingsRequest,
  Schedule,
  ScheduleRun,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  PaginatedResponse,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: options?.signal ?? controller.signal,
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
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
  installSkill: (teamId: string, agentId: string, data: { repo_url: string; skill_name: string }) =>
    request<{ output: string }>(`/api/teams/${teamId}/agents/${agentId}/skills/install`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getInstructions: (teamId: string, agentId: string) =>
    request<AgentInstructions>(
      `/api/teams/${encodeURIComponent(teamId)}/agents/${encodeURIComponent(agentId)}/instructions`,
    ),
  updateInstructions: (teamId: string, agentId: string, content: string) =>
    request<void>(
      `/api/teams/${encodeURIComponent(teamId)}/agents/${encodeURIComponent(agentId)}/instructions`,
      {
        method: 'PUT',
        body: JSON.stringify({ content }),
      },
    ),
};

// Chat & Messages
export const chatApi = {
  send: (teamId: string, data: ChatRequest) =>
    request<ChatResponse>(`/api/teams/${teamId}/chat`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export interface MessagesListOptions {
  types?: string[];
  before?: string;
  limit?: number;
}

export const messagesApi = {
  list: (teamId: string, options?: MessagesListOptions) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.types?.length) params.set('types', options.types.join(','));
    if (options?.before) params.set('before', options.before);
    const qs = params.toString();
    return request<TaskLog[]>(`/api/teams/${teamId}/messages${qs ? `?${qs}` : ''}`);
  },
};

export interface ActivityListOptions {
  before?: string;
  limit?: number;
}

export const activityApi = {
  list: (teamId: string, options?: ActivityListOptions) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', options.before);
    const qs = params.toString();
    return request<TaskLog[]>(`/api/teams/${teamId}/activity${qs ? `?${qs}` : ''}`);
  },
};

// Schedules
export const schedulesApi = {
  list: () => request<Schedule[]>('/api/schedules'),
  get: (id: string) => request<Schedule>(`/api/schedules/${id}`),
  create: (data: CreateScheduleRequest) =>
    request<Schedule>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateScheduleRequest) =>
    request<Schedule>(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/api/schedules/${id}`, { method: 'DELETE' }),
  toggle: (id: string) =>
    request<Schedule>(`/api/schedules/${id}/toggle`, { method: 'PATCH' }),
  runs: (scheduleId: string) =>
    request<PaginatedResponse<ScheduleRun>>(`/api/schedules/${scheduleId}/runs`),
  getRun: (scheduleId: string, runId: string) =>
    request<ScheduleRun>(`/api/schedules/${scheduleId}/runs/${runId}`),
  getConfig: () =>
    request<{ timeout: string }>('/api/schedules/config'),
};

// Settings
export const settingsApi = {
  list: () => request<Setting[]>('/api/settings'),
  upsert: (data: UpdateSettingsRequest) =>
    request<Setting>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (key: string) =>
    request<void>(`/api/settings/${encodeURIComponent(key)}`, { method: 'DELETE' }),
};
