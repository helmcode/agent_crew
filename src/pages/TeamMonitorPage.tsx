import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import type { Team, TaskLog, ContainerStatus } from '../types';
import { teamsApi, messagesApi, chatApi } from '../services/api';
import { connectTeamActivity, type ConnectionState } from '../services/websocket';
import { StatusBadge } from '../components/StatusBadge';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

const messageTypeColors: Record<string, string> = {
  user_message: 'text-blue-400',
  agent_response: 'text-cyan-400',
  tool_call: 'text-yellow-400',
  tool_result: 'text-green-400',
  status: 'text-slate-400',
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

export function TeamMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = id!;

  const [team, setTeam] = useState<Team | null>(null);
  const [messages, setMessages] = useState<TaskLog[]>([]);
  const [wsState, setWsState] = useState<ConnectionState>('disconnected');
  const [chatMessage, setChatMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

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
    messagesApi.list(teamId).then((data) => setMessages(data ?? [])).catch(() => {});
    const interval = setInterval(fetchTeam, 10000);
    return () => clearInterval(interval);
  }, [teamId, fetchTeam]);

  // WebSocket connection
  useEffect(() => {
    const disconnect = connectTeamActivity(teamId, {
      onMessage: (log) => setMessages((prev) => [...prev, log].slice(-500)),
      onStateChange: setWsState,
    });
    return disconnect;
  }, [teamId]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, autoScroll]);

  function handleLogsScroll() {
    const el = logsContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  }

  async function handleSend() {
    if (!chatMessage.trim() || sending) return;
    setSending(true);
    try {
      await chatApi.send(teamId, { message: chatMessage.trim() });
      setChatMessage('');
      toast('info', 'Message sent to team leader');
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to send message. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const filteredMessages = messages.filter((msg) => {
    if (filterAgent !== 'all' && msg.from_agent !== filterAgent) return false;
    if (filterType !== 'all' && msg.message_type !== filterType) return false;
    return true;
  });

  const agentNames = [...new Set(messages.map((m) => m.from_agent).filter(Boolean))];
  const messageTypes = [...new Set(messages.map((m) => m.message_type).filter(Boolean))];

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

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4">
      {/* Left Panel: Team Info & Agents */}
      <div className="hidden w-64 flex-shrink-0 flex-col rounded-lg border border-slate-700/50 bg-slate-800/50 md:flex">
        <div className="border-b border-slate-700 p-4">
          <h2 className="mb-1 text-lg font-semibold text-white">{team.name}</h2>
          <p className="mb-2 text-xs text-slate-400">{team.description || 'No description'}</p>
          <StatusBadge status={team.status} />
          <div className="mt-2 text-xs text-slate-500">
            <span className="font-mono">{team.runtime === 'kubernetes' ? '☸️' : '🐳'} {team.runtime}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            {team.runtime === 'kubernetes' ? 'Pod Status' : 'Container Status'}
          </h3>
          {team.agents && team.agents.length > 0 ? (
            <div className="space-y-2">
              {team.agents.map((agent) => {
                const dotColor: Record<ContainerStatus, string> = {
                  running: 'bg-green-400',
                  stopped: 'bg-slate-400',
                  error: 'bg-red-400',
                };
                return (
                  <div key={agent.id} className="flex items-center gap-2 rounded-md bg-slate-900/50 px-3 py-2">
                    <span className={`h-2 w-2 rounded-full ${dotColor[agent.container_status]} ${agent.container_status === 'running' ? 'animate-pulse' : ''}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{agent.name}</p>
                      <p className="text-xs text-slate-500">{agent.role}{agent.specialty ? ` \u2022 ${agent.specialty}` : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No agents</p>
          )}
        </div>
      </div>

      {/* Center Panel: Activity Feed */}
      <div className="flex flex-1 flex-col rounded-lg border border-slate-700/50 bg-slate-800/50">
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
          ref={logsContainerRef}
          onScroll={handleLogsScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-sm"
        >
          {filteredMessages.length === 0 ? (
            <p className="text-center text-sm text-slate-500">No activity yet</p>
          ) : (
            filteredMessages.map((msg) => (
              <div key={msg.id} className="mb-2 rounded bg-slate-900/50 px-3 py-2">
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
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Right Panel: Chat */}
      <div className="hidden w-80 flex-shrink-0 flex-col rounded-lg border border-slate-700/50 bg-slate-800/50 lg:flex">
        <div className="border-b border-slate-700 px-4 py-3">
          <h3 className="text-sm font-medium text-white">Chat</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {messages.filter((m) => m.message_type === 'user_message' || m.message_type === 'agent_response').length === 0 ? (
            <p className="text-center text-xs text-slate-500">Send a message to the team</p>
          ) : (
            messages
              .filter((m) => m.message_type === 'user_message' || m.message_type === 'agent_response')
              .map((msg) => (
                <div key={msg.id} className="mb-3">
                  <div className="mb-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <span>{msg.from_agent || 'System'}</span>
                    <span>&middot;</span>
                    <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                  </div>
                  <p className={`rounded-lg px-3 py-2 text-sm ${
                    msg.from_agent === 'user'
                      ? 'bg-blue-600/10 text-blue-300'
                      : 'bg-slate-900/50 text-slate-300'
                  }`}>
                    {formatPayload(msg.payload)}
                  </p>
                </div>
              ))
          )}
        </div>
        <div className="border-t border-slate-700 p-3">
          <div className="flex gap-2">
            <input
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Send a message..."
              disabled={team.status !== 'running'}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || !chatMessage.trim() || team.status !== 'running'}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
