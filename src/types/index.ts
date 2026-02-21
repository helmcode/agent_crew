export type TeamStatus = 'stopped' | 'deploying' | 'running' | 'error';

export type AgentRole = 'leader' | 'worker';

export type ContainerStatus = 'stopped' | 'running' | 'error';

export interface Team {
  id: string;
  name: string;
  description: string;
  status: TeamStatus;
  runtime: string;
  workspace_path: string;
  agents?: Agent[];
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  team_id: string;
  name: string;
  role: AgentRole;
  claude_md: string;
  specialty: string;
  system_prompt: string;
  skills: unknown;
  permissions: unknown;
  resources: unknown;
  container_id: string;
  container_status: ContainerStatus;
  sub_agent_description?: string;
  sub_agent_tools?: string;
  sub_agent_model?: string;
  sub_agent_permission_mode?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskLog {
  id: string;
  team_id: string;
  message_id: string;
  from_agent: string;
  to_agent: string;
  message_type: string;
  payload: unknown;
  error?: string;
  created_at: string;
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  updated_at: string;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  runtime?: string;
  workspace_path?: string;
  agents?: CreateAgentInput[];
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  workspace_path?: string;
}

export interface CreateAgentInput {
  name: string;
  role?: 'leader' | 'worker';
  claude_md?: string;
  sub_agent_description?: string;
  sub_agent_tools?: string;
  sub_agent_model?: string;
  sub_agent_permission_mode?: string;
}

export interface CreateAgentRequest {
  name: string;
  role?: 'leader' | 'worker';
  claude_md?: string;
  sub_agent_description?: string;
  sub_agent_tools?: string;
  sub_agent_model?: string;
  sub_agent_permission_mode?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  role?: 'leader' | 'worker';
  claude_md?: string;
  sub_agent_description?: string;
  sub_agent_tools?: string;
  sub_agent_model?: string;
  sub_agent_permission_mode?: string;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  status: string;
  message: string;
}

export interface UpdateSettingsRequest {
  key: string;
  value: string;
}
