import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Team, TaskLog, ContainerStatus } from '../types';
import { teamsApi, messagesApi, activityApi, chatApi } from '../services/api';
import { connectTeamActivity, type ConnectionState } from '../services/websocket';
import { StatusBadge } from '../components/StatusBadge';
import { MarkdownRenderer } from '../components/Markdown';
import { ActivityEventCard, LiveActivityFeed } from '../components/ActivityPanel';
import { toast } from '../components/Toast';
import { SettingsButton, SettingsModal, hasFailedSkills, getFailureMessage } from '../components/SkillStatusPanel';
import { friendlyError } from '../utils/errors';

const messageTypeColors: Record<string, string> = {
  user_message: 'text-blue-400',
  leader_response: 'text-cyan-400',
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

const CHAT_TYPES = new Set(['user_message', 'leader_response', 'agent_response', 'error', 'task_result']);

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
  if (msg.message_type === 'leader_response' || msg.message_type === 'task_result') {
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

    case 'leader_response':
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
  const [liveActivityEvents, setLiveActivityEvents] = useState<TaskLog[]>([]);
  const [chatInputError, setChatInputError] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [agentTooltipVisible, setAgentTooltipVisible] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const activityContainerRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
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
        // Clear the thinking indicator and live activity feed when an agent reply arrives
        if (
          (log.message_type === 'leader_response' || log.message_type === 'agent_response' || log.message_type === 'task_result' || log.message_type === 'error') &&
          log.from_agent !== 'user'
        ) {
          setWaitingForReply(false);
          setLiveActivityEvents([]);
        }

        // Route activity_event to live feed in chat panel
        if (log.message_type === 'activity_event') {
          setLiveActivityEvents((prev) => [...prev, log].slice(-50));
        }

        // Refresh team data on any skill_status message (installed or failed)
        if (log.message_type === 'skill_status') {
          if (hasFailedSkills(log)) {
            toast('error', getFailureMessage(log));
          }
          fetchTeam();
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

  // Auto-scroll chat panel when new content appears (messages, activity events, thinking state).
  useEffect(() => {
    if (chatMessages.length > prevChatCountRef.current) {
      prevChatCountRef.current = chatMessages.length;
    }
    if (autoScroll) {
      requestAnimationFrame(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [chatMessages, liveActivityEvents, waitingForReply, autoScroll]);

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

  // Close filter popover when clicking outside
  useEffect(() => {
    if (!filterPopoverOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setFilterPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterPopoverOpen]);

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
            <div
              className="relative flex items-center gap-1.5"
              onMouseEnter={() => setAgentTooltipVisible(true)}
              onMouseLeave={() => setAgentTooltipVisible(false)}
            >
              <span
                className="rounded-full bg-slate-700/50 px-2.5 py-1 text-xs font-medium text-slate-300"
                data-testid="agent-count-badge"
              >
                {team.agents.length} agent{team.agents.length !== 1 ? 's' : ''}
              </span>
              <button
                className="rounded p-0.5 text-slate-400 transition-colors hover:text-white"
                data-testid="agent-info-icon"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
              {agentTooltipVisible && (
                <div
                  className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-slate-700 bg-slate-800 p-3 shadow-xl"
                  data-testid="agent-tooltip"
                >
                  <div className="space-y-2">
                    {team.agents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span
                          className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${dotColor[agent.container_status]}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-200">
                              {agent.name}
                            </span>
                            <span className="text-slate-500">
                              {agent.role}
                            </span>
                          </div>
                          {agent.skill_statuses &&
                            agent.skill_statuses.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {agent.skill_statuses.map((s) => {
                                  const skillLabel = s.name.includes(':')
                                    ? s.name.split(':').pop()!
                                    : s.name;
                                  return (
                                    <span
                                      key={s.name}
                                      className={`rounded px-1 py-0.5 text-[10px] ${
                                        s.status === 'installed'
                                          ? 'bg-green-500/10 text-green-400'
                                          : s.status === 'failed'
                                            ? 'bg-red-500/10 text-red-400'
                                            : 'bg-yellow-500/10 text-yellow-400'
                                      }`}
                                    >
                                      {skillLabel}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {team.agents && (
        <SettingsModal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          agents={team.agents}
          teamId={teamId}
          onSkillInstalled={fetchTeam}
        />
      )}

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
            <LiveActivityFeed events={liveActivityEvents} />
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
            <div className="flex items-center gap-2">
              {team.agents && team.agents.length > 0 && (
                <SettingsButton
                  agents={team.agents}
                  onClick={() => setSettingsModalOpen(true)}
                  disabled={team.status !== 'running'}
                />
              )}
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
            <div className="relative" ref={filterPopoverRef}>
              <button
                onClick={() => setFilterPopoverOpen(!filterPopoverOpen)}
                className={`flex items-center gap-1 rounded p-1.5 text-xs transition-colors ${
                  filterAgent !== 'all' || filterType !== 'all'
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                }`}
                data-testid="activity-filter-button"
                title="Filter activity"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                {(filterAgent !== 'all' || filterType !== 'all') && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
              </button>
              {filterPopoverOpen && (
                <div
                  className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-800 p-3 shadow-xl"
                  data-testid="activity-filter-popover"
                >
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Agent
                      </label>
                      <select
                        value={filterAgent}
                        onChange={(e) => setFilterAgent(e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="all">All agents</option>
                        {agentNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Type
                      </label>
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="all">All types</option>
                        {messageTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(filterAgent !== 'all' || filterType !== 'all') && (
                      <button
                        onClick={() => {
                          setFilterAgent('all');
                          setFilterType('all');
                        }}
                        className="w-full rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-600"
                        data-testid="clear-filters-button"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
              )}
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
              filteredActivity.map((msg) =>
                msg.message_type === 'activity_event' ? (
                  <ActivityEventCard key={msg.id} log={msg} />
                ) : (
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
                )
              )
            )}
            <div ref={activityEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
