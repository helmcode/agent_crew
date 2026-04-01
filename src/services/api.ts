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
  AuthConfig,
  AuthTokens,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  InviteRegisterRequest,
  InvitePreview,
  AuthMeResponse,
  UpdateProfileRequest,
  ChangePasswordRequest,
  User,
  UserRole,
  Organization,
  Invite,
  CreateInviteRequest,
  ResetPasswordResponse,
  OllamaStatus,
  Document,
} from '../types';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth';

const API_URL = import.meta.env.VITE_API_URL || '';

const REQUEST_TIMEOUT_MS = 30_000;

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Callback invoked on auth failure (set by AuthContext)
let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(cb: () => void): void {
  onAuthFailure = cb;
}

function buildHeaders(options?: RequestInit): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge any custom headers from options
  if (options?.headers) {
    const incoming = options.headers as Record<string, string>;
    Object.assign(headers, incoming);
  }

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

async function attemptRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data: AuthTokens = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function handleTokenRefresh(): Promise<boolean> {
  if (isRefreshing) {
    return refreshPromise!;
  }
  isRefreshing = true;
  refreshPromise = attemptRefresh().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

interface RequestOptions extends RequestInit {
  _skipAuth?: boolean;
  _retried?: boolean;
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = options?._skipAuth
      ? { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) }
      : buildHeaders(options);

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: options?.signal ?? controller.signal,
    });

    // Handle 401 with token refresh (only for authenticated requests)
    if (res.status === 401 && !options?._skipAuth && !options?._retried) {
      const refreshed = await handleTokenRefresh();
      if (refreshed) {
        return request<T>(path, { ...options, _retried: true });
      }
      clearTokens();
      onAuthFailure?.();
      throw new Error('Session expired');
    }

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
  send: async (teamId: string, data: ChatRequest, files?: File[]): Promise<ChatResponse> => {
    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('message', data.message);
      for (const file of files) {
        formData.append('files', file);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = {};
        const token = getAccessToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        // Do NOT set Content-Type — let browser set multipart boundary
        const res = await fetch(`${API_URL}/api/teams/${teamId}/chat`, {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });

        if (res.status === 401) {
          const refreshed = await handleTokenRefresh();
          if (refreshed) {
            return chatApi.send(teamId, data, files);
          }
          clearTokens();
          onAuthFailure?.();
          throw new Error('Session expired');
        }

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

    return request<ChatResponse>(`/api/teams/${teamId}/chat`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
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

// Knowledge Base
export const knowledgeApi = {
  list: () => request<Document[]>('/api/knowledge/documents'),
  get: (id: string) => request<Document>(`/api/knowledge/documents/${id}`),
  upload: async (file: File, name?: string): Promise<Document> => {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const headers: Record<string, string> = {};
      const token = getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_URL}/api/knowledge/documents`, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      if (res.status === 401) {
        const refreshed = await handleTokenRefresh();
        if (refreshed) {
          return knowledgeApi.upload(file, name);
        }
        clearTokens();
        onAuthFailure?.();
        throw new Error('Session expired');
      }

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
      return res.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Upload timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
  delete: (id: string) =>
    request<void>(`/api/knowledge/documents/${id}`, { method: 'DELETE' }),
};

// Ollama
export const ollamaApi = {
  status: () => request<OllamaStatus>('/api/ollama/status'),
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

// Auth
export const authApi = {
  config: () =>
    request<AuthConfig>('/api/auth/config', { _skipAuth: true }),
  login: (data: LoginRequest) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
      _skipAuth: true,
    }),
  register: (data: RegisterRequest) =>
    request<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      _skipAuth: true,
    }),
  refresh: (refreshToken: string) =>
    request<AuthTokens>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
      _skipAuth: true,
    }),
  me: () => request<AuthMeResponse>('/api/auth/me'),
  updateProfile: (data: UpdateProfileRequest) =>
    request<User>('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  changePassword: (data: ChangePasswordRequest) =>
    request<void>('/api/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  inviteInfo: (token: string) =>
    request<InvitePreview>(`/api/auth/invite/${encodeURIComponent(token)}`, {
      _skipAuth: true,
    }),
  registerWithInvite: (data: InviteRegisterRequest) =>
    request<RegisterResponse>('/api/auth/register/invite', {
      method: 'POST',
      body: JSON.stringify(data),
      _skipAuth: true,
    }),
};

// Organization
export const orgApi = {
  get: () => request<Organization>('/api/org'),
  update: (data: { name: string }) =>
    request<Organization>('/api/org', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  members: () => request<User[]>('/api/org/members'),
  removeMember: (id: string) =>
    request<void>(`/api/org/members/${id}`, { method: 'DELETE' }),
  changeRole: (id: string, role: UserRole) =>
    request<User>(`/api/org/members/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  resetPassword: (id: string) =>
    request<ResetPasswordResponse>(`/api/org/members/${id}/reset-password`, {
      method: 'POST',
    }),
  invites: () => request<Invite[]>('/api/org/invites'),
  createInvite: (data: CreateInviteRequest) =>
    request<Invite>('/api/org/invites', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteInvite: (id: string) =>
    request<void>(`/api/org/invites/${id}`, { method: 'DELETE' }),
};
