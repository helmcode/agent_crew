import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Team, TaskLog, ContainerStatus, SkillStatus } from '../types';
import { teamsApi, messagesApi, activityApi, chatApi } from '../services/api';
import { connectTeamActivity, type ConnectionState } from '../services/websocket';
import { StatusBadge } from '../components/StatusBadge';
import { MarkdownRenderer } from '../components/Markdown';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

const messageTypeColors: Record<string, string> = {
  user_message: 'text-blue-400',
  agent_response: 'text-cyan-400',
  tool_call: 'text-yellow-400',
  tool_result: 'text-green-400',
  task_result: 'text-green-400',
  status: 'text-slate-400',
  status_update: 'text-slate-400',
  error: 'text-red-400',
};

function formatPayload(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  try {
    const obj = typeof payload === 'object' ? payload : JSON.parse(String(payload));
    if (obj && typeof obj === 'object' && 'content' in obj) return String(obj.content);
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(payload);
  }
}

const CHAT_TYPES = new Set(['user_message', 'agent_response', 'error', 'task_result']);

// innerPayload extracts the actual message payload from a TaskLog.
// The relay stores the full protocol.Message as TaskLog.payload, so the
// real content is at payload.payload (nested). This handles both structures.
function innerPayload(msg: TaskLog): Record<string, unknown> {
  const p = msg.payload as Record<string, unknown> | null;
  if (!p) return {};
  // If the stored payload looks like a protocol.Message (has a nested "payload" key),
  // use the inner payload. Otherwise use the top-level payload directly.
  if (p.payload && typeof p.payload === 'object') {
    return p.payload as Record<string, unknown>;
  }
  return p;
}

function isErrorMessage(msg: TaskLog): boolean {
  if (msg.message_type === 'error') return true;
  if (msg.error) return true;
  if (msg.message_type === 'task_result') {
    const inner = innerPayload(msg);
    if (inner.error || inner.is_error || inner.status === 'failed') return true;
  }
  return false;
}

function getErrorText(msg: TaskLog): string {
  if (msg.error) return msg.error;
  const inner = innerPayload(msg);
  if (typeof inner.error === 'string' && inner.error) return inner.error;
  if (typeof inner.content === 'string' && inner.content) return inner.content;
  if (typeof inner.status === 'string') return `Task ${inner.status}.`;
  return formatPayload(msg.payload);
}

function getChatText(msg: TaskLog): string {
  const p = msg.payload as Record<string, unknown> | null;
  const inner = innerPayload(msg);

  switch (msg.message_type) {
    case 'user_message':
      if (p && typeof p.content === 'string') return p.content;
      if (typeof inner.content === 'string' && inner.content) return inner.content;
      return formatPayload(msg.payload);

    case 'task_result': {
      if (typeof inner.result === 'string' && inner.result) return inner.result;
      if (typeof inner.error === 'string' && inner.error) return inner.error;
      if (typeof inner.content === 'string' && inner.content) return inner.content;
      // Friendly fallback when the payload carries a status but no readable text
      // (e.g. the agent finished but returned an empty result string).
      if (typeof inner.status === 'string') return `Task ${inner.status}.`;
      return formatPayload(msg.payload);
    }

    case 'agent_response': {
      // Check top-level first (flat payload), then inner (NATS envelope).
      if (p && typeof p.content === 'string') return p.content;
      if (typeof inner.content === 'string' && inner.content) return inner.content;
      if (typeof inner.result === 'string' && inner.result) return inner.result;
      return formatPayload(msg.payload);
    }

    default:
      return formatPayload(msg.payload);
  }
}

function SkillStatusIndicator({ statuses, agentName }: { statuses: SkillStatus[]; agentName: string }) {
  const failed = statuses.filter((s) => s.status === 'failed');
  const pending = statuses.filter((s) => s.status === 'pending');
  const installed = statuses.filter((s) => s.status === 'installed');

  if (failed.length > 0) {
    const failedNames = failed.map((s) => s.name).join(', ');
    return (
      <span
        data-testid={`skill-status-${agentName}`}
        className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400"
        title={`Failed: ${failedNames}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span data-testid={`skill-failed-names-${agentName}`}>{failedNames}</span>
      </span>
    );
  }

  if (pending.length > 0) {
    return (
      <span
        data-testid={`skill-status-${agentName}`}
        className="flex items-center gap-1 rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-400"
        title={`Installing ${pending.length} skill${pending.length > 1 ? 's' : ''}...`}
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
        {pending.length}/{statuses.length}
      </span>
    );
  }

  if (installed.length === statuses.length) {
    return (
      <span
        data-testid={`skill-status-${agentName}`}
        className="flex items-center gap-1 rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400"
        title={`${installed.length} skill${installed.length > 1 ? 's' : ''} installed`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        {installed.length}
      </span>
    );
  }

  return null;
}

export function TeamMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = id!;
  const navigate = useNavigate();

  const [team, setTeam] = useState<Team | null>(null);
  const [chatMessages, setChatMessages] = useState<TaskLog[]>([]);
  const [activityMessages, setActivityMessages] = useState<TaskLog[]>([]);
  const [wsState, setWsState] = useState<ConnectionState>('disconnected');
  const [chatMessage, setChatMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingForReply, setWaitingForReply] = useState(false);
  const [chatInputError, setChatInputError] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const activityContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activityAutoScroll, setActivityAutoScroll] = useState(true);
  // Track previous message counts to only scroll when NEW messages arrive,
  // not on every render cycle (e.g. caused by team status polling).
  const prevChatCountRef = useRef(0);
  const prevActivityCountRef = useRef(0);

  const fetchTeam = useCallback(async () => {
    try {
      const data = await teamsApi.get(teamId);
      setTeam(data);
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to load team. Please try again.'));
    }
  }, [teamId]);

  // Initial data load
  useEffect(() => {
    fetchTeam();
    messagesApi.list(teamId).then((data) => {
      const sorted = (data ?? []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setChatMessages(sorted);
    }).catch(() => {});
    activityApi.list(teamId).then((data) => {
      const sorted = (data ?? []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setActivityMessages(sorted);
    }).catch(() => {});
    const interval = setInterval(fetchTeam, 10000);
    return () => clearInterval(interval);
  }, [teamId, fetchTeam]);

  // WebSocket connection — deduplicate by message ID, replace optimistic messages
  useEffect(() => {
    const disconnect = connectTeamActivity(teamId, {
      onMessage: (log) => {
        // Clear the thinking indicator when an agent reply arrives
        if (
          (log.message_type === 'agent_response' || log.message_type === 'task_result' || log.message_type === 'error') &&
          log.from_agent !== 'user'
        ) {
          setWaitingForReply(false);
        }

        // Route to activity panel (all message types)
        setActivityMessages((prev) => {
          if (prev.some((m) => m.id === log.id)) return prev;
          return [...prev, log].slice(-500);
        });

        // Route to chat panel (chat-relevant types only)
        if (CHAT_TYPES.has(log.message_type)) {
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === log.id)) return prev;

            // For real user messages, replace a matching optimistic placeholder
            if (log.message_type === 'user_message' && log.from_agent === 'user') {
              const incoming = log.payload as Record<string, unknown>;
              const content = typeof incoming?.content === 'string' ? incoming.content : null;
              if (content) {
                const idx = prev.findIndex(
                  (m) =>
                    m.id.startsWith('optimistic-') &&
                    m.message_type === 'user_message' &&
                    (m.payload as Record<string, unknown>)?.content === content,
                );
                if (idx !== -1) {
                  const next = [...prev];
                  next[idx] = log;
                  return next;
                }
              }
            }

            return [...prev, log].slice(-500);
          });
        }
      },
      onStateChange: setWsState,
    });
    return disconnect;
  }, [teamId]);

  // Auto-scroll chat panel when new messages arrive.
  useEffect(() => {
    if (chatMessages.length > prevChatCountRef.current) {
      prevChatCountRef.current = chatMessages.length;
      if (autoScroll) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, autoScroll]);

  // Auto-scroll activity panel when new messages arrive.
  useEffect(() => {
    if (activityMessages.length > prevActivityCountRef.current) {
      prevActivityCountRef.current = activityMessages.length;
      if (activityAutoScroll) activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activityMessages, activityAutoScroll]);

  function handleChatScroll() {
    const el = chatContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  }

  function handleActivityScroll() {
    const el = activityContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setActivityAutoScroll(atBottom);
  }

  async function handleSend() {
    if (!chatMessage.trim()) {
      setChatInputError(true);
      return;
    }
    if (sending) return;
    setChatInputError(false);
    const text = chatMessage.trim();
    setSending(true);
    // Optimistic update: add message to local state immediately
    const optimistic: TaskLog = {
      id: `optimistic-${Date.now()}`,
      team_id: teamId,
      message_id: '',
      from_agent: 'user',
      to_agent: 'leader',
      message_type: 'user_message',
      payload: { content: text },
      created_at: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, optimistic]);
    setChatMessage('');
    setWaitingForReply(true);
    try {
      await chatApi.send(teamId, { message: text });
    } catch (err) {
      // Remove optimistic message on failure
      setChatMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setWaitingForReply(false);
      setChatMessage(text);
      toast('error', friendlyError(err, 'Failed to send message. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const filteredActivity = activityMessages.filter((msg) => {
    if (msg.message_type === 'status_update') return false;
    if (filterAgent !== 'all' && msg.from_agent !== filterAgent) return false;
    if (filterType !== 'all' && msg.message_type !== filterType) return false;
    return true;
  });

  const agentNames = [...new Set(activityMessages.map((m) => m.from_agent).filter(Boolean))];
  const messageTypes = [...new Set(activityMessages.map((m) => m.message_type).filter(Boolean))];

  const connectionColors: Record<ConnectionState, string> = {
    connected: 'bg-green-400',
    connecting: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-slate-500',
    error: 'bg-red-400',
  };

  if (!team) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const dotColor: Record<ContainerStatus, string> = {
    running: 'bg-green-400',
    stopped: 'bg-slate-400',
    error: 'bg-red-400',
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4">
      {/* Top Bar: Back button + Team Info */}
      <div className="flex flex-shrink-0 items-center gap-4 rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Teams
        </button>
        <div className="h-5 w-px bg-slate-700" />
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">{team.name}</h2>
          <StatusBadge status={team.status} />
        </div>
        {team.description && (
          <>
            <div className="h-5 w-px bg-slate-700" />
            <p className="truncate text-xs text-slate-400">{team.description}</p>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {team.agents && team.agents.length > 0 && (
            <div className="flex items-center gap-1.5">
              {team.agents.map((agent) => (
                <div key={agent.id} className="group relative flex items-center gap-1.5 rounded-md bg-slate-900/50 px-2 py-1">
                  {agent.role === 'leader' ? (
                    <>
                      <span data-testid={`agent-dot-${agent.name}`} className={`h-2 w-2 rounded-full ${dotColor[agent.container_status]} ${agent.container_status === 'running' ? 'animate-pulse' : ''}`} />
                      <span className="text-xs text-slate-300">{agent.name}</span>
                      <span className="text-xs text-slate-600">leader</span>
                    </>
                  ) : (
                    <>
                      <svg data-testid={`sub-agent-icon-${agent.name}`} className="h-3 w-3 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs text-slate-300">{agent.name}</span>
                      {agent.sub_agent_description && (
                        <span className="max-w-[12rem] truncate text-xs text-slate-500" title={agent.sub_agent_description}>
                          {agent.sub_agent_description}
                        </span>
                      )}
                      {agent.skill_statuses && agent.skill_statuses.length > 0 && (
                        <SkillStatusIndicator statuses={agent.skill_statuses} agentName={agent.name} />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Chat (left, large) + Activity (right, narrow) */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Chat Panel — Main */}
        <div className="flex flex-1 flex-col rounded-lg border border-slate-700/50 bg-slate-800/50">
          <div className="border-b border-slate-700 px-4 py-3">
            <h3 className="text-sm font-medium text-white">Chat</h3>
          </div>
          <div
            data-testid="chat-messages"
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            className="flex-1 overflow-y-auto p-4"
          >
            {chatMessages.length === 0 ? (
              <p className="text-center text-sm text-slate-500">Send a message to the team</p>
            ) : (
              chatMessages.map((msg) => {
                const hasError = isErrorMessage(msg);
                return (
                  <div key={msg.id} className="mb-3">
                    <div className="mb-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <span>{msg.from_agent || 'System'}</span>
                      <span>&middot;</span>
                      <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                    </div>
                    {hasError ? (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                        <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-red-400">
                          <span>&#x26A0;&#xFE0F;</span>
                          <span>Error</span>
                        </div>
                        <p className="text-sm text-red-300">{getErrorText(msg)}</p>
                        <button
                          onClick={() => navigate('/settings')}
                          className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700"
                        >
                          Go to Settings
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className={`rounded-lg px-3 py-2 text-sm ${
                        msg.from_agent === 'user'
                          ? 'bg-blue-600/10 text-blue-300'
                          : 'bg-slate-900/50 text-slate-300'
                      }`}>
                        <MarkdownRenderer>{getChatText(msg)}</MarkdownRenderer>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {waitingForReply && (
              <div className="mb-3">
                <div className="mb-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <span>Agent</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-slate-900/50 px-3 py-2 text-sm text-slate-400">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                  </span>
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-slate-700 p-3">
            <div className="flex gap-2">
              <input
                value={chatMessage}
                onChange={(e) => {
                  setChatMessage(e.target.value);
                  if (chatInputError && e.target.value.trim()) setChatInputError(false);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Send a message..."
                disabled={team.status !== 'running'}
                className={`flex-1 rounded-lg border bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none disabled:opacity-50 ${
                  chatInputError
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-slate-600 focus:border-blue-500'
                }`}
              />
              <button
                onClick={handleSend}
                disabled={sending || team.status !== 'running'}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* Activity Panel — Right, narrower */}
        <div className="hidden w-96 flex-shrink-0 flex-col rounded-lg border border-slate-700/50 bg-slate-800/50 lg:flex">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-white">Activity</h3>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${connectionColors[wsState]}`} />
                <span className="text-xs text-slate-500">{wsState}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="all">All agents</option>
                {agentNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="all">All types</option>
                {messageTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
          <div
            data-testid="activity-messages"
            ref={activityContainerRef}
            onScroll={handleActivityScroll}
            className="flex-1 overflow-y-auto p-4 font-mono text-sm"
          >
            {filteredActivity.length === 0 ? (
              <p className="text-center text-sm text-slate-500">No activity yet</p>
            ) : (
              filteredActivity.map((msg) => (
                  <div
                    key={msg.id}
                    className="mb-2 rounded bg-slate-900/50 px-3 py-2"
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className={messageTypeColors[msg.message_type] ?? 'text-slate-400'}>
                        [{msg.message_type}]
                      </span>
                      {msg.from_agent && (
                        <span className="text-slate-500">
                          {msg.from_agent}{msg.to_agent ? ` \u2192 ${msg.to_agent}` : ''}
                        </span>
                      )}
                      <span className="ml-auto text-slate-600">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-xs text-slate-300">
                      {formatPayload(msg.payload)}
                    </pre>
                  </div>
                ))
            )}
            <div ref={activityEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
