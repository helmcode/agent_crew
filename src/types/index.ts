export type TeamStatus = 'stopped' | 'deploying' | 'running' | 'error';

export type AgentRole = 'leader' | 'worker';

export type AgentProvider = 'claude' | 'opencode';

export type ContainerStatus = 'stopped' | 'running' | 'error';

export type SkillInstallState = 'pending' | 'installed' | 'failed';

export interface SkillConfig {
  repo_url: string;
  skill_name: string;
}

export interface SkillStatus {
  name: string;
  status: SkillInstallState;
  error?: string;
}

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface McpServerConfig {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpServerStatus {
  name: string;
  status: 'configured' | 'error';
  error?: string;
}

export interface McpConfigResponse {
  content: string;
  path: string;
  provider: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  status: TeamStatus;
  status_message?: string;
  runtime: string;
  workspace_path: string;
  provider: AgentProvider;
  mcp_servers?: McpServerConfig[];
  mcp_statuses?: McpServerStatus[];
  agents?: Agent[];
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  team_id: string;
  name: string;
  role: AgentRole;
  instructions_md: string;
  specialty: string;
  system_prompt: string;
  skills: unknown;
  skill_statuses?: SkillStatus[];
  permissions: unknown;
  resources: unknown;
  container_id: string;
  container_status: ContainerStatus;
  sub_agent_description?: string;
  sub_agent_skills?: SkillConfig[];
  sub_agent_model?: string;
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
  is_secret: boolean;
  updated_at: string;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  runtime?: string;
  workspace_path?: string;
  provider?: AgentProvider;
  mcp_servers?: McpServerConfig[];
  agents?: CreateAgentInput[];
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  workspace_path?: string;
  provider?: AgentProvider;
  mcp_servers?: McpServerConfig[];
}

export interface CreateAgentInput {
  name: string;
  role?: 'leader' | 'worker';
  instructions_md?: string;
  sub_agent_description?: string;
  sub_agent_skills?: SkillConfig[];
  sub_agent_model?: string;
}

export interface CreateAgentRequest {
  name: string;
  role?: 'leader' | 'worker';
  instructions_md?: string;
  sub_agent_description?: string;
  sub_agent_skills?: SkillConfig[];
  sub_agent_model?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  role?: 'leader' | 'worker';
  instructions_md?: string;
  sub_agent_description?: string;
  sub_agent_skills?: SkillConfig[];
  sub_agent_model?: string;
}

export interface AgentInstructions {
  content: string;
  path: string;
}

export type ActivityEventType = 'tool_use' | 'assistant' | 'reasoning' | 'tool_result' | 'error';

export interface ActivityEvent {
  event_type: ActivityEventType;
  agent_name: string;
  tool_name?: string;
  action?: string;
  payload?: unknown;
  timestamp: string;
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
  is_secret: boolean;
}

// Paginated response

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// Schedules

export type ScheduleStatus = 'idle' | 'running' | 'error';

export type ScheduleRunStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface Schedule {
  id: string;
  name: string;
  team_id: string;
  team?: { id: string; name: string };
  prompt: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  status: ScheduleStatus;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  team_deployment_id: string;
  started_at: string;
  finished_at: string | null;
  status: ScheduleRunStatus;
  error: string;
  prompt_sent?: string;
  response_received?: string;
}

export interface CreateScheduleRequest {
  name: string;
  team_id: string;
  prompt: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
}

export interface UpdateScheduleRequest {
  name?: string;
  prompt?: string;
  cron_expression?: string;
  timezone?: string;
  enabled?: boolean;
}

// Webhooks

export type WebhookStatus = 'idle' | 'running';

export type WebhookRunStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface Webhook {
  id: string;
  name: string;
  team_id: string;
  team?: { id: string; name: string };
  prompt_template: string;
  secret_prefix: string;
  enabled: boolean;
  timeout_seconds: number;
  max_concurrent: number;
  last_triggered_at: string | null;
  status: WebhookStatus;
  created_at: string;
  updated_at: string;
}

export interface WebhookWithToken {
  token: string;
  webhook: Webhook;
}

export interface WebhookRun {
  id: string;
  webhook_id: string;
  started_at: string;
  finished_at: string | null;
  status: WebhookRunStatus;
  error: string;
  prompt_sent?: string;
  response_received?: string;
  request_payload?: string;
  caller_ip?: string;
}

export interface CreateWebhookRequest {
  name: string;
  team_id: string;
  prompt_template: string;
  timeout_seconds?: number;
  max_concurrent?: number;
  enabled?: boolean;
}

export interface UpdateWebhookRequest {
  name?: string;
  prompt_template?: string;
  timeout_seconds?: number;
  max_concurrent?: number;
  enabled?: boolean;
}

// Post-Actions

export type PostActionAuthType = 'none' | 'bearer' | 'basic' | 'header';
export type PostActionRunStatus = 'success' | 'failed' | 'retrying';
export type TriggerType = 'webhook' | 'schedule';
export type TriggerOn = 'success' | 'failure' | 'any';

export interface PostAction {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body_template: string;
  auth_type: PostActionAuthType;
  auth_config: Record<string, string>;
  timeout_seconds: number;
  retry_count: number;
  enabled: boolean;
  bindings_count?: number;
  bindings?: PostActionBinding[];
  created_at: string;
  updated_at: string;
}

export interface PostActionBinding {
  id: string;
  post_action_id: string;
  trigger_type: TriggerType;
  trigger_id: string;
  trigger_name?: string;
  trigger_on: TriggerOn;
  body_override: string;
  enabled: boolean;
  created_at: string;
  post_action?: PostAction;
}

export interface PostActionRun {
  id: string;
  post_action_id: string;
  binding_id: string;
  source_type: string;
  source_run_id: string;
  triggered_at: string;
  completed_at: string | null;
  status: PostActionRunStatus;
  status_code: number;
  response_body: string;
  error: string;
  request_sent: string;
}

export interface CreatePostActionRequest {
  name: string;
  description?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body_template?: string;
  auth_type?: PostActionAuthType;
  auth_config?: Record<string, string>;
  timeout_seconds?: number;
  retry_count?: number;
  enabled?: boolean;
}

export interface UpdatePostActionRequest {
  name?: string;
  description?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body_template?: string;
  auth_type?: PostActionAuthType;
  auth_config?: Record<string, string>;
  timeout_seconds?: number;
  retry_count?: number;
  enabled?: boolean;
}

export interface CreateBindingRequest {
  trigger_type: TriggerType;
  trigger_id: string;
  trigger_on: TriggerOn;
  body_override?: string;
  enabled?: boolean;
}

export interface UpdateBindingRequest {
  trigger_on?: TriggerOn;
  body_override?: string;
  enabled?: boolean;
}
