import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectTeamActivity, connectAgentLogs } from './websocket';
import type { TaskLog } from '../types';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.onclose?.();
  }

  simulateError() {
    this.onerror?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('connectTeamActivity', () => {
  it('connects to the correct URL', () => {
    connectTeamActivity('team-uuid-1', { onMessage: vi.fn() });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain('/ws/teams/team-uuid-1/activity');
  });

  it('calls onMessage when a message is received', () => {
    const onMessage = vi.fn();
    connectTeamActivity('team-uuid-1', { onMessage });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const log: TaskLog = {
      id: 'test-id',
      team_id: 'team-uuid-1',
      message_id: 'msg-uuid-1',
      from_agent: 'agent',
      to_agent: 'leader',
      message_type: 'user_message',
      payload: { content: 'Hello' },
      created_at: '2026-01-01T00:00:00Z',
    };
    ws.simulateMessage(log);
    expect(onMessage).toHaveBeenCalledWith(log);
  });

  it('calls onStateChange on connect', () => {
    const onStateChange = vi.fn();
    connectTeamActivity('team-uuid-1', { onMessage: vi.fn(), onStateChange });
    expect(onStateChange).toHaveBeenCalledWith('connecting');

    MockWebSocket.instances[0].simulateOpen();
    expect(onStateChange).toHaveBeenCalledWith('connected');
  });

  it('reconnects with exponential backoff on close', () => {
    const onStateChange = vi.fn();
    connectTeamActivity('team-uuid-1', { onMessage: vi.fn(), onStateChange });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateClose();

    expect(onStateChange).toHaveBeenCalledWith('disconnected');

    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('stops reconnecting after disconnect() is called', () => {
    const disconnect = connectTeamActivity('team-uuid-1', { onMessage: vi.fn() });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    disconnect();
    expect(ws.closed).toBe(true);

    ws.simulateClose();
    vi.advanceTimersByTime(30000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('reports error state on WebSocket error', () => {
    const onStateChange = vi.fn();
    connectTeamActivity('team-uuid-1', { onMessage: vi.fn(), onStateChange });
    MockWebSocket.instances[0].simulateError();
    expect(onStateChange).toHaveBeenCalledWith('error');
  });
});

describe('connectAgentLogs', () => {
  it('connects to the correct URL', () => {
    connectAgentLogs('team-uuid-1', 'agent-uuid-5', { onMessage: vi.fn() });
    expect(MockWebSocket.instances[0].url).toContain('/ws/teams/team-uuid-1/logs/agent-uuid-5');
  });
});
