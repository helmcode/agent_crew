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
  Webhook,
  WebhookWithToken,
  WebhookRun,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  PaginatedResponse,
  McpConfigResponse,
  McpServerConfig,
  PostAction,
  PostActionBinding,
  PostActionRun,
  CreatePostActionRequest,
  UpdatePostActionRequest,
  CreateBindingRequest,
  UpdateBindingRequest,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';

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
  getMcpConfig: (id: string) =>
    request<McpConfigResponse>(`/api/teams/${id}/mcp`),
  updateMcpConfig: (id: string, content: string) =>
    request<void>(`/api/teams/${id}/mcp`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  addMcpServer: (id: string, data: McpServerConfig) =>
    request<Team>(`/api/teams/${id}/mcp/servers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  removeMcpServer: (id: string, serverName: string) =>
    request<void>(`/api/teams/${id}/mcp/servers/${encodeURIComponent(serverName)}`, {
      method: 'DELETE',
    }),
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
  postActions: (id: string) =>
    request<PostActionBinding[]>(`/api/schedules/${id}/post-actions`),
};

// Webhooks
export const webhooksApi = {
  list: () => request<Webhook[]>('/api/webhooks'),
  get: (id: string) => request<Webhook>(`/api/webhooks/${id}`),
  create: (data: CreateWebhookRequest) =>
    request<WebhookWithToken>('/api/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateWebhookRequest) =>
    request<Webhook>(`/api/webhooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/api/webhooks/${id}`, { method: 'DELETE' }),
  toggle: (id: string) =>
    request<Webhook>(`/api/webhooks/${id}/toggle`, { method: 'PATCH' }),
  regenerateToken: (id: string) =>
    request<WebhookWithToken>(`/api/webhooks/${id}/regenerate`, { method: 'POST' }),
  runs: (webhookId: string) =>
    request<PaginatedResponse<WebhookRun>>(`/api/webhooks/${webhookId}/runs`),
  getRun: (webhookId: string, runId: string) =>
    request<WebhookRun>(`/api/webhooks/${webhookId}/runs/${runId}`),
  postActions: (id: string) =>
    request<PostActionBinding[]>(`/api/webhooks/${id}/post-actions`),
};

// Post-Actions
export const postActionsApi = {
  list: () => request<PostAction[]>('/api/post-actions'),
  get: (id: string) => request<PostAction>(`/api/post-actions/${id}`),
  create: (data: CreatePostActionRequest) =>
    request<PostAction>('/api/post-actions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdatePostActionRequest) =>
    request<PostAction>(`/api/post-actions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/api/post-actions/${id}`, { method: 'DELETE' }),

  // Bindings
  createBinding: (id: string, data: CreateBindingRequest) =>
    request<PostActionBinding>(`/api/post-actions/${id}/bindings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBinding: (id: string, bid: string, data: UpdateBindingRequest) =>
    request<PostActionBinding>(`/api/post-actions/${id}/bindings/${bid}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteBinding: (id: string, bid: string) =>
    request<void>(`/api/post-actions/${id}/bindings/${bid}`, { method: 'DELETE' }),

  // Runs
  runs: (id: string) =>
    request<PaginatedResponse<PostActionRun>>(`/api/post-actions/${id}/runs`),
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
