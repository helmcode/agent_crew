import { describe, it, expect, vi, beforeEach } from 'vitest';
import { teamsApi, agentsApi, chatApi, messagesApi, activityApi, settingsApi } from './api';
import { mockTeam, mockAgent, mockTaskLog, mockSetting, createFetchMock } from '../test/mocks';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('teamsApi', () => {
  it('lists teams', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    const result = await teamsApi.list();
    expect(result).toEqual([mockTeam]);
  });

  it('gets a team by id', async () => {
    global.fetch = createFetchMock({ '/api/teams/team-uuid-1': { body: mockTeam } });
    const result = await teamsApi.get('team-uuid-1');
    expect(result).toEqual(mockTeam);
  });

  it('creates a team', async () => {
    global.fetch = createFetchMock({ '/api/teams': { body: mockTeam } });
    const result = await teamsApi.create({ name: 'test-team' });
    expect(result).toEqual(mockTeam);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[1]?.method).toBe('POST');
  });

  it('updates a team', async () => {
    const updated = { ...mockTeam, name: 'updated' };
    global.fetch = createFetchMock({ '/api/teams/team-uuid-1': { body: updated } });
    const result = await teamsApi.update('team-uuid-1', { name: 'updated' });
    expect(result.name).toBe('updated');
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[1]?.method).toBe('PUT');
  });

  it('deletes a team', async () => {
    global.fetch = createFetchMock({ '/api/teams/team-uuid-1': { status: 204 } });
    await teamsApi.delete('team-uuid-1');
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[1]?.method).toBe('DELETE');
  });

  it('deploys a team', async () => {
    const deploying = { ...mockTeam, status: 'deploying' as const };
    global.fetch = createFetchMock({ '/api/teams/team-uuid-1/deploy': { body: deploying } });
    const result = await teamsApi.deploy('team-uuid-1');
    expect(result.status).toBe('deploying');
  });

  it('stops a team', async () => {
    const stopped = { ...mockTeam, status: 'stopped' as const };
    global.fetch = createFetchMock({ '/api/teams/team-uuid-1/stop': { body: stopped } });
    const result = await teamsApi.stop('team-uuid-1');
    expect(result.status).toBe('stopped');
  });

  it('throws on HTTP error', async () => {
    global.fetch = createFetchMock({ '/api/teams': { status: 500, body: 'Internal Server Error' } });
    await expect(teamsApi.list()).rejects.toThrow();
  });
});

describe('agentsApi', () => {
  it('lists agents for a team', async () => {
    global.fetch = createFetchMock({ '/agents': { body: [mockAgent] } });
    const result = await agentsApi.list('team-uuid-1');
    expect(result).toEqual([mockAgent]);
  });

  it('gets an agent', async () => {
    global.fetch = createFetchMock({ '/agents/agent-uuid-1': { body: mockAgent } });
    const result = await agentsApi.get('team-uuid-1', 'agent-uuid-1');
    expect(result).toEqual(mockAgent);
  });

  it('creates an agent', async () => {
    global.fetch = createFetchMock({ '/agents': { body: mockAgent } });
    const result = await agentsApi.create('team-uuid-1', { name: 'test-agent' });
    expect(result).toEqual(mockAgent);
  });

  it('updates an agent', async () => {
    global.fetch = createFetchMock({ '/agents/agent-uuid-1': { body: { ...mockAgent, name: 'updated' } } });
    const result = await agentsApi.update('team-uuid-1', 'agent-uuid-1', { name: 'updated' });
    expect(result.name).toBe('updated');
  });

  it('deletes an agent', async () => {
    global.fetch = createFetchMock({ '/agents/agent-uuid-1': { status: 204 } });
    await agentsApi.delete('team-uuid-1', 'agent-uuid-1');
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[1]?.method).toBe('DELETE');
  });
});

describe('chatApi', () => {
  it('sends a chat message', async () => {
    global.fetch = createFetchMock({ '/chat': { body: { status: 'queued', message: 'Message sent to team leader' } } });
    const result = await chatApi.send('team-uuid-1', { message: 'Hello' });
    expect(result.status).toBe('queued');
  });
});

describe('messagesApi', () => {
  it('lists messages with no options', async () => {
    global.fetch = createFetchMock({ '/messages': { body: [mockTaskLog] } });
    const result = await messagesApi.list('team-uuid-1');
    expect(result).toEqual([mockTaskLog]);
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('/messages');
    expect(url).not.toContain('?');
  });

  it('lists messages with limit option', async () => {
    global.fetch = createFetchMock({ '/messages': { body: [] } });
    await messagesApi.list('team-uuid-1', { limit: 10 });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
  });

  it('lists messages with types filter', async () => {
    global.fetch = createFetchMock({ '/messages': { body: [] } });
    await messagesApi.list('team-uuid-1', { types: ['user_message', 'task_result'] });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('types=user_message');
    expect(url).toContain('task_result');
  });

  it('lists messages with before cursor', async () => {
    global.fetch = createFetchMock({ '/messages': { body: [] } });
    await messagesApi.list('team-uuid-1', { before: '2026-01-01T00:00:00Z' });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('before=');
  });
});

describe('activityApi', () => {
  it('lists activity with no options', async () => {
    global.fetch = createFetchMock({ '/activity': { body: [mockTaskLog] } });
    const result = await activityApi.list('team-uuid-1');
    expect(result).toEqual([mockTaskLog]);
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('/activity');
    expect(url).not.toContain('?');
  });

  it('lists activity with limit', async () => {
    global.fetch = createFetchMock({ '/activity': { body: [] } });
    await activityApi.list('team-uuid-1', { limit: 20 });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('limit=20');
  });

  it('lists activity with before cursor', async () => {
    global.fetch = createFetchMock({ '/activity': { body: [] } });
    await activityApi.list('team-uuid-1', { before: '2026-01-01T00:00:00Z' });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('before=');
  });
});

describe('request timeout', () => {
  it('throws "Request timed out" when fetch exceeds timeout', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(() => new Promise<Response>(() => {}));

    const promise = teamsApi.list();
    vi.advanceTimersByTime(30_000);

    await expect(promise).rejects.toThrow('Request timed out');
    vi.useRealTimers();
  });

  it('clears timeout on successful response', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    global.fetch = createFetchMock({ '/api/teams': { body: [mockTeam] } });
    await teamsApi.list();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe('settingsApi', () => {
  it('lists settings', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: [mockSetting] } });
    const result = await settingsApi.list();
    expect(result).toEqual([mockSetting]);
  });

  it('upserts a setting', async () => {
    global.fetch = createFetchMock({ '/api/settings': { body: mockSetting } });
    const result = await settingsApi.upsert({ key: 'api_key', value: 'new-value' });
    expect(result).toEqual(mockSetting);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[1]?.method).toBe('PUT');
  });
});
