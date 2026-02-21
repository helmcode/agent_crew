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

describe('isValidTaskLog validation (indirect)', () => {
  it('ignores messages with missing required fields', () => {
    const onMessage = vi.fn();
    connectTeamActivity('team-1', { onMessage });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Missing id
    ws.simulateMessage({ team_id: 't', message_type: 'm', created_at: 'c' });
    // Missing team_id
    ws.simulateMessage({ id: 'i', message_type: 'm', created_at: 'c' });
    // Missing message_type
    ws.simulateMessage({ id: 'i', team_id: 't', created_at: 'c' });
    // Missing created_at
    ws.simulateMessage({ id: 'i', team_id: 't', message_type: 'm' });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores null and non-object data', () => {
    const onMessage = vi.fn();
    connectTeamActivity('team-1', { onMessage });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage(null);
    ws.simulateMessage('a string');
    ws.simulateMessage(42);
    ws.simulateMessage(true);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores invalid JSON (malformed messages)', () => {
    const onMessage = vi.fn();
    connectTeamActivity('team-1', { onMessage });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Send raw invalid JSON directly to the onmessage handler
    ws.onmessage?.({ data: 'not valid json {{{' });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('passes valid TaskLog data through to onMessage', () => {
    const onMessage = vi.fn();
    connectTeamActivity('team-1', { onMessage });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      id: 'valid-1',
      team_id: 'team-1',
      message_type: 'user_message',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});

describe('retry behavior', () => {
  it('stops reconnecting after max retries (default 10)', () => {
    connectTeamActivity('team-1', { onMessage: vi.fn() });
    expect(MockWebSocket.instances).toHaveLength(1);

    // Close without opening (so retryCount is not reset) 10 times
    for (let i = 0; i < 10; i++) {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();
      const delay = Math.min(1000 * Math.pow(2, i), 30000);
      vi.advanceTimersByTime(delay);
    }

    // Initial + 10 retries = 11 instances
    expect(MockWebSocket.instances).toHaveLength(11);

    // One more close should NOT create another instance
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances).toHaveLength(11);
  });

  it('uses exponential backoff delays', () => {
    connectTeamActivity('team-1', { onMessage: vi.fn() });
    MockWebSocket.instances[0].simulateOpen();
    MockWebSocket.instances[0].simulateClose();

    // Retry 0: delay = 1000ms
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1].simulateClose();

    // Retry 1: delay = 2000ms
    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    MockWebSocket.instances[2].simulateClose();

    // Retry 2: delay = 4000ms
    vi.advanceTimersByTime(3999);
    expect(MockWebSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('caps backoff delay at 30 seconds', () => {
    connectTeamActivity('team-1', { onMessage: vi.fn() });

    // Advance through 5 retries without opening (to reach large delays)
    for (let i = 0; i < 5; i++) {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();
      vi.advanceTimersByTime(Math.min(1000 * Math.pow(2, i), 30000));
    }

    const countBefore = MockWebSocket.instances.length;
    MockWebSocket.instances[countBefore - 1].simulateClose();

    // At retryCount=5: delay = min(1000 * 2^5, 30000) = min(32000, 30000) = 30000
    vi.advanceTimersByTime(29999);
    expect(MockWebSocket.instances).toHaveLength(countBefore);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(countBefore + 1);
  });

  it('resets retry count on successful connection', () => {
    connectTeamActivity('team-1', { onMessage: vi.fn() });
    MockWebSocket.instances[0].simulateOpen();
    MockWebSocket.instances[0].simulateClose();

    // First retry at 1000ms (retryCount was 0 after open, incremented to 1)
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second WS opens (resetting retryCount to 0) then closes
    MockWebSocket.instances[1].simulateOpen();
    MockWebSocket.instances[1].simulateClose();

    // Next retry should be at 1000ms again (retryCount reset to 0)
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
  });
});
