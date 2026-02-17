import type { Team, Agent, TaskLog, Setting } from '../types';

export const mockTeam: Team = {
  id: 'team-uuid-1',
  name: 'test-team',
  description: 'A test team for unit tests',
  status: 'stopped',
  runtime: 'docker',
  workspace_path: '/tmp/workspace',
  agents: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const mockAgent: Agent = {
  id: 'agent-uuid-1',
  team_id: 'team-uuid-1',
  name: 'test-agent',
  role: 'leader',
  specialty: 'testing',
  system_prompt: 'You are a test agent',
  skills: ['coding', 'testing'],
  permissions: { read: true },
  resources: {},
  container_id: '',
  container_status: 'stopped',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const mockRunningTeam: Team = {
  ...mockTeam,
  id: 'team-uuid-2',
  name: 'running-team',
  status: 'running',
  agents: [
    mockAgent,
    { ...mockAgent, id: 'agent-uuid-2', name: 'worker-agent', role: 'worker', container_status: 'running' },
  ],
};

export const mockTaskLog: TaskLog = {
  id: 'log-uuid-1',
  team_id: 'team-uuid-1',
  message_id: 'msg-uuid-1',
  from_agent: 'test-agent',
  to_agent: 'leader',
  message_type: 'user_message',
  payload: { content: 'Hello from agent' },
  created_at: '2026-01-01T00:00:01Z',
};

export const mockSetting: Setting = {
  id: 1,
  key: 'api_key',
  value: 'sk-test-123',
  updated_at: '2026-01-01T00:00:00Z',
};

export function createFetchMock(responses: Record<string, { status?: number; body?: unknown }>) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    for (const [pattern, response] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        const status = response.status ?? 200;
        return new Response(
          status === 204 ? null : JSON.stringify(response.body),
          {
            status,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  });
}
