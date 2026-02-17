import { execSync, spawn, type ChildProcess } from 'child_process';

const BACKEND_DIR = '/Users/barckcode/repository/helmcode/ai/agent_crew/backend';
const API_BINARY = `${BACKEND_DIR}/bin/testserver`;
const API_PORT = 3333;

let apiProcess: ChildProcess | null = null;

export const TEST_API_URL = `http://localhost:${API_PORT}`;

export async function startBackend(): Promise<void> {
  // Build the test server binary (uses mock runtime + in-memory DB).
  execSync(
    `cd ${BACKEND_DIR} && CGO_ENABLED=1 go build -o bin/testserver ./cmd/testserver`,
    { stdio: 'pipe' },
  );

  // Start the test server.
  apiProcess = spawn(API_BINARY, [], {
    env: {
      ...process.env,
      LISTEN_ADDR: `:${API_PORT}`,
    },
    stdio: 'pipe',
  });

  apiProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes('error')) {
      console.error('[testserver]', msg);
    }
  });

  // Wait for server to be ready.
  await waitForServer();
}

export async function stopBackend(): Promise<void> {
  if (apiProcess) {
    apiProcess.kill('SIGTERM');
    apiProcess = null;
    // Give the process a moment to clean up.
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function waitForServer(retries = 30): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${TEST_API_URL}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Backend test server failed to start');
}
