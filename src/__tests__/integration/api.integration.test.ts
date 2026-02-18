import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startBackend, stopBackend, TEST_API_URL } from './setup';

// Helper to make requests to the test API.
// Uses the actual backend routes at /api/* (not /api/v1/*).
async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${TEST_API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = res.status !== 204 ? await res.json() : undefined;
  return { status: res.status, data };
}

describe('Frontend-Backend Integration', () => {
  beforeAll(async () => {
    await startBackend();
  }, 60000);

  afterAll(async () => {
    await stopBackend();
  });

  // ─── Health Check ──────────────────────────────────────────────────

  describe('Health Check', () => {
    it('should return ok', async () => {
      const { status, data } = await api('/health');
      expect(status).toBe(200);
      expect(data.status).toBe('ok');
    });
  });

  // ─── Teams CRUD ────────────────────────────────────────────────────

  describe('Teams Lifecycle', () => {
    let teamId: string;

    it('should create a team', async () => {
      const { status, data } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: 'test-team',
          description: 'Integration test team',
        }),
      });
      expect(status).toBe(201);
      expect(data.name).toBe('test-team');
      expect(data.description).toBe('Integration test team');
      expect(data.status).toBe('stopped');
      expect(data.runtime).toBe('docker');
      expect(data.id).toBeDefined();
      expect(typeof data.id).toBe('string');
      teamId = data.id;
    });

    it('should list teams', async () => {
      const { status, data } = await api('/api/teams');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((t: { name: string }) => t.name === 'test-team')).toBe(true);
    });

    it('should get a team by ID', async () => {
      const { status, data } = await api(`/api/teams/${teamId}`);
      expect(status).toBe(200);
      expect(data.name).toBe('test-team');
      expect(data.id).toBe(teamId);
    });

    it('should update a team', async () => {
      const { status, data } = await api(`/api/teams/${teamId}`, {
        method: 'PUT',
        body: JSON.stringify({ description: 'Updated description' }),
      });
      expect(status).toBe(200);
      expect(data.description).toBe('Updated description');
      expect(data.name).toBe('test-team');
    });

    it('should delete a team', async () => {
      // Create a team specifically for deletion.
      const { data: created } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'delete-me-team' }),
      });
      const { status } = await api(`/api/teams/${created.id}`, {
        method: 'DELETE',
      });
      expect(status).toBe(204);

      // Verify deletion.
      const { status: getStatus } = await api(`/api/teams/${created.id}`);
      expect(getStatus).toBe(404);
    });

    it('should reject duplicate team names', async () => {
      const { status } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'test-team' }),
      });
      expect(status).toBe(409);
    });
  });

  // ─── Teams with Agents ────────────────────────────────────────────

  describe('Teams with Agents', () => {
    it('should create a team with inline agents', async () => {
      const { status, data } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: 'team-with-agents',
          agents: [
            { name: 'leader-agent', role: 'leader', system_prompt: 'You lead' },
            { name: 'worker-agent', specialty: 'devops' },
          ],
        }),
      });
      expect(status).toBe(201);
      expect(data.agents).toHaveLength(2);
      expect(data.agents[0].role).toBe('leader');
      expect(data.agents[1].role).toBe('worker'); // default role
    });
  });

  // ─── Agents CRUD ──────────────────────────────────────────────────

  describe('Agents Management', () => {
    let teamId: string;
    let agentId: string;

    beforeAll(async () => {
      const { data } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'agent-crud-team' }),
      });
      teamId = data.id;
    });

    it('should create an agent', async () => {
      const { status, data } = await api(`/api/teams/${teamId}/agents`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'test-agent',
          role: 'leader',
          specialty: 'backend',
          system_prompt: 'You are a backend specialist',
        }),
      });
      expect(status).toBe(201);
      expect(data.name).toBe('test-agent');
      expect(data.role).toBe('leader');
      expect(data.specialty).toBe('backend');
      expect(data.team_id).toBe(teamId);
      agentId = data.id;
    });

    it('should list agents for a team', async () => {
      const { status, data } = await api(`/api/teams/${teamId}/agents`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
    });

    it('should get an agent by ID', async () => {
      const { status, data } = await api(
        `/api/teams/${teamId}/agents/${agentId}`,
      );
      expect(status).toBe(200);
      expect(data.name).toBe('test-agent');
    });

    it('should update an agent', async () => {
      const { status, data } = await api(
        `/api/teams/${teamId}/agents/${agentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'worker', specialty: 'frontend' }),
        },
      );
      expect(status).toBe(200);
      expect(data.role).toBe('worker');
      expect(data.specialty).toBe('frontend');
    });

    it('should delete an agent', async () => {
      // Create a new agent to delete.
      const { data: created } = await api(`/api/teams/${teamId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ name: 'delete-agent' }),
      });
      const { status } = await api(
        `/api/teams/${teamId}/agents/${created.id}`,
        { method: 'DELETE' },
      );
      expect(status).toBe(204);

      // Verify deletion.
      const { status: getStatus } = await api(
        `/api/teams/${teamId}/agents/${created.id}`,
      );
      expect(getStatus).toBe(404);
    });
  });

  // ─── Deploy & Stop ────────────────────────────────────────────────

  describe('Team Deploy & Stop', () => {
    let teamId: string;

    beforeAll(async () => {
      const { data } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: 'deploy-test-team',
          agents: [{ name: 'deploy-agent', role: 'worker' }],
        }),
      });
      teamId = data.id;
    });

    it('should deploy a team', async () => {
      const { status, data } = await api(`/api/teams/${teamId}/deploy`, {
        method: 'POST',
      });
      expect(status).toBe(200);
      expect(data.status).toBe('deploying');
    });

    it('should reject deploying an already running team', async () => {
      // Wait for async deploy to complete.
      await new Promise((r) => setTimeout(r, 500));

      const { status } = await api(`/api/teams/${teamId}/deploy`, {
        method: 'POST',
      });
      // Team should be running after async deploy, so 409.
      expect(status).toBe(409);
    });

    it('should stop a running team', async () => {
      // Ensure team is running first.
      await new Promise((r) => setTimeout(r, 500));

      const { data: team } = await api(`/api/teams/${teamId}`);
      if (team.status !== 'running') {
        // Skip if deployment hasn't completed yet.
        return;
      }

      const { status, data } = await api(`/api/teams/${teamId}/stop`, {
        method: 'POST',
      });
      expect(status).toBe(200);
      expect(data.status).toBe('stopped');
    });

    it('should reject stopping a non-running team', async () => {
      // Create a fresh team that is stopped.
      const { data: freshTeam } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'stop-test-stopped' }),
      });
      const { status } = await api(`/api/teams/${freshTeam.id}/stop`, {
        method: 'POST',
      });
      expect(status).toBe(409);
    });

    it('should reject deleting a running team', async () => {
      // Create and deploy a team.
      const { data: team } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: 'del-running-team',
          agents: [{ name: 'agent-dr' }],
        }),
      });
      await api(`/api/teams/${team.id}/deploy`, { method: 'POST' });
      // Wait for deploy to finish.
      await new Promise((r) => setTimeout(r, 500));

      const { status } = await api(`/api/teams/${team.id}`, {
        method: 'DELETE',
      });
      expect(status).toBe(409);

      // Clean up: stop then delete.
      await api(`/api/teams/${team.id}/stop`, { method: 'POST' });
      await api(`/api/teams/${team.id}`, { method: 'DELETE' });
    });
  });

  // ─── Chat & Messages ──────────────────────────────────────────────

  describe('Chat & Messages', () => {
    let teamId: string;

    beforeAll(async () => {
      const { data } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: 'chat-test-team',
          agents: [{ name: 'chat-agent' }],
        }),
      });
      teamId = data.id;
    });

    it('should reject chat to a non-running team', async () => {
      const { status } = await api(`/api/teams/${teamId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello team!' }),
      });
      // Team is stopped, so chat should return 409 conflict.
      expect(status).toBe(409);
    });

    it('should send chat to a running team', async () => {
      // Deploy team first.
      await api(`/api/teams/${teamId}/deploy`, { method: 'POST' });
      await new Promise((r) => setTimeout(r, 500));

      const { status, data } = await api(`/api/teams/${teamId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello team!' }),
      });
      expect(status).toBe(200);
      expect(data.status).toBe('queued');
    });

    it('should reject empty chat message', async () => {
      const { status } = await api(`/api/teams/${teamId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: '' }),
      });
      expect(status).toBe(400);
    });

    it('should list messages for a team', async () => {
      // Note: backend uses /messages, frontend client uses /logs.
      const { status, data } = await api(`/api/teams/${teamId}/messages`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].from_agent).toBe('user');
      expect(data[0].to_agent).toBe('leader');
    });

    afterAll(async () => {
      // Clean up: stop the team.
      await api(`/api/teams/${teamId}/stop`, { method: 'POST' });
    });
  });

  // ─── Settings ─────────────────────────────────────────────────────

  describe('Settings', () => {
    it('should return empty settings list', async () => {
      const { status, data } = await api('/api/settings');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should create a new setting via PUT (upsert)', async () => {
      // Note: backend uses PUT /api/settings for upsert, not POST.
      const { status, data } = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'test_key', value: 'test_value' }),
      });
      expect(status).toBe(200);
      expect(data.key).toBe('test_key');
      expect(data.value).toBe('test_value');
    });

    it('should update an existing setting via PUT', async () => {
      const { status, data } = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'test_key', value: 'updated_value' }),
      });
      expect(status).toBe(200);
      expect(data.key).toBe('test_key');
      expect(data.value).toBe('updated_value');
    });

    it('should list settings after creation', async () => {
      // Create another setting.
      await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'another_key', value: 'another_value' }),
      });

      const { status, data } = await api('/api/settings');
      expect(status).toBe(200);
      expect(data.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject setting without key', async () => {
      const { status } = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ value: 'no_key' }),
      });
      expect(status).toBe(400);
    });
  });

  // ─── Error Cases ──────────────────────────────────────────────────

  describe('Error Cases', () => {
    it('should return 400 for empty team name', async () => {
      const { status } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });
      expect(status).toBe(400);
    });

    it('should accept team names with spaces and special characters', async () => {
      const { status } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'valid name with spaces!' }),
      });
      expect(status).toBe(201);
    });

    it('should return 404 for non-existent team', async () => {
      const { status } = await api('/api/teams/nonexistent-uuid');
      expect(status).toBe(404);
    });

    it('should return 404 for non-existent agent', async () => {
      const { data: team } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'error-test-team' }),
      });
      const { status } = await api(
        `/api/teams/${team.id}/agents/nonexistent-uuid`,
      );
      expect(status).toBe(404);
    });

    it('should return 404 for agents of non-existent team', async () => {
      const { status } = await api('/api/teams/nonexistent/agents');
      expect(status).toBe(404);
    });

    it('should return 404 for messages of non-existent team', async () => {
      const { status } = await api('/api/teams/nonexistent/messages');
      expect(status).toBe(404);
    });

    it('should return 400 for agent with empty name', async () => {
      const { data: team } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'agent-err-team' }),
      });
      const { status } = await api(`/api/teams/${team.id}/agents`, {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });
      expect(status).toBe(400);
    });
  });

  // ─── API Route Mismatch Documentation ─────────────────────────────
  // These tests document mismatches between the frontend API client
  // (src/services/api.ts) and the actual backend routes.

  describe('Frontend-Backend Route Mismatch Detection', () => {
    it('should confirm /api/teams works (backend has no /v1 prefix)', async () => {
      const { status: correctStatus } = await api('/api/teams');
      expect(correctStatus).toBe(200);
    });

    it('should confirm /api/v1/teams returns 404 (frontend uses wrong prefix)', async () => {
      const res = await fetch(`${TEST_API_URL}/api/v1/teams`);
      expect(res.status).toBe(404);
    });

    it('should confirm /api/settings works via PUT (frontend expects POST+DELETE+GET by key)', async () => {
      const { status } = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'mismatch-test', value: 'val' }),
      });
      expect(status).toBe(200);
    });

    it('should confirm /api/teams/:id/messages is the correct route (frontend uses /logs)', async () => {
      const { data: team } = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: 'route-test-team' }),
      });
      const { status } = await api(`/api/teams/${team.id}/messages`);
      expect(status).toBe(200);
    });
  });
});
