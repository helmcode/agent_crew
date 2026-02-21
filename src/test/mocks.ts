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
  claude_md: '# Leader Agent\n\nYou coordinate the team.',
  specialty: 'testing',
  system_prompt: 'You are a test agent',
  skills: ['coding', 'testing'],
  permissions: { read: true },
  resources: {},
  container_id: '',
  container_status: 'stopped',
  sub_agent_description: undefined,
  sub_agent_tools: undefined,
  sub_agent_model: undefined,
  sub_agent_permission_mode: undefined,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const mockWorkerAgent: Agent = {
  ...mockAgent,
  id: 'agent-uuid-worker',
  name: 'worker-agent',
  role: 'worker',
  claude_md: 'You handle backend tasks.',
  sub_agent_description: 'Handles backend API development and database operations',
  sub_agent_tools: 'Read, Grep, Bash, Edit',
  sub_agent_model: 'sonnet',
  sub_agent_permission_mode: 'acceptEdits',
};

export const mockRunningTeam: Team = {
  ...mockTeam,
  id: 'team-uuid-2',
  name: 'running-team',
  status: 'running',
  agents: [
    { ...mockAgent, container_status: 'running' },
    { ...mockWorkerAgent, id: 'agent-uuid-2' },
  ],
};

export const mockK8sTeam: Team = {
  ...mockTeam,
  id: 'team-uuid-3',
  name: 'k8s-team',
  description: 'A Kubernetes-based agent team',
  runtime: 'kubernetes',
  workspace_path: '/workspace',
  status: 'running',
  agents: [
    { ...mockAgent, id: 'agent-uuid-3', name: 'k8s-leader', container_status: 'running' },
    { ...mockAgent, id: 'agent-uuid-4', name: 'k8s-worker', role: 'worker', container_status: 'running' },
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
