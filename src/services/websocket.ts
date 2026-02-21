import type { TaskLog } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function isValidTaskLog(data: unknown): data is TaskLog {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.team_id === 'string' &&
    typeof obj.message_type === 'string' &&
    typeof obj.created_at === 'string'
  );
}

function getWsUrl(): string {
  const url = new URL(API_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketOptions {
  onMessage: (log: TaskLog) => void;
  onStateChange?: (state: ConnectionState) => void;
  maxRetries?: number;
}

export function connectTeamActivity(
  teamId: string,
  options: WebSocketOptions,
): () => void {
  return createConnection(
    `${getWsUrl()}/ws/teams/${teamId}/activity`,
    options,
  );
}

export function connectAgentLogs(
  teamId: string,
  agentId: string,
  options: WebSocketOptions,
): () => void {
  return createConnection(
    `${getWsUrl()}/ws/teams/${teamId}/logs/${agentId}`,
    options,
  );
}

function createConnection(url: string, options: WebSocketOptions): () => void {
  const maxRetries = options.maxRetries ?? 10;
  let retryCount = 0;
  let ws: WebSocket | null = null;
  let closed = false;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (closed) return;
    options.onStateChange?.('connecting');
    ws = new WebSocket(url);

    ws.onopen = () => {
      retryCount = 0;
      options.onStateChange?.('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!isValidTaskLog(data)) return;
        options.onMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (closed) return;
      options.onStateChange?.('disconnected');
      retry();
    };

    ws.onerror = () => {
      options.onStateChange?.('error');
      ws?.close();
    };
  }

  function retry() {
    if (closed || retryCount >= maxRetries) return;
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    retryCount++;
    retryTimeout = setTimeout(connect, delay);
  }

  connect();

  return () => {
    closed = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    ws?.close();
  };
}
