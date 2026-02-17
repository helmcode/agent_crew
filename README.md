# AgentCrew Frontend

Web UI for managing multi-agent AI teams. Build, configure, deploy, and monitor teams of AI agents running on Docker or Kubernetes.

## Tech Stack

- **React 19** with TypeScript
- **Vite 7** for bundling and dev server
- **Tailwind CSS 4** for styling
- **React Router 6** for client-side routing
- **Vitest** for unit and integration testing
- **Testing Library** for component tests

## Features

- **Team Builder** — Step-by-step wizard to create agent teams with Docker or Kubernetes runtime selection
- **Team Monitor** — Real-time activity feed via WebSocket, agent status overview, and chat interface
- **Teams List** — Dashboard showing all teams with status badges, deploy/stop controls
- **Settings** — Key-value configuration management for the API
- **Runtime Support** — Visual distinction between Docker and Kubernetes teams throughout the UI

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start dev server (default: http://localhost:5173)
npm run dev
```

The frontend expects the AgentCrew API running at the URL specified in `VITE_API_URL` (defaults to `http://localhost:3000`).

### Docker Compose

From the project root (`../`):

```bash
docker compose up
```

This starts the full stack:
- **NATS** message broker on port 4222
- **API** backend on port 3000
- **Frontend** on port 8080

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:3000` |

## Project Structure

```
src/
  pages/           # Route-level page components
    TeamsListPage    # Teams dashboard
    TeamBuilderPage  # Team creation wizard
    TeamMonitorPage  # Real-time team monitoring
    SettingsPage     # Settings management
  components/      # Reusable UI components
    Layout           # App shell with navigation
    StatusBadge      # Status indicator badges
    LoadingSkeleton  # Loading placeholders
    EmptyState       # Empty state illustrations
    Toast            # Toast notification system
  services/        # API and WebSocket clients
    api.ts           # REST API client (teams, agents, chat, settings)
    websocket.ts     # WebSocket client with auto-reconnect
  types/           # TypeScript type definitions
    index.ts         # Shared interfaces and types
  test/            # Test utilities and mocks
    mocks.ts         # Mock data for tests
    setup.ts         # Vitest setup
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:integration` | Run integration tests |

## API Integration

The frontend connects to the AgentCrew API via:

- **REST API** (`services/api.ts`) — CRUD operations for teams, agents, settings, and chat
- **WebSocket** (`services/websocket.ts`) — Real-time activity stream with exponential backoff reconnection

All API calls go through a centralized `request()` function that handles errors, JSON parsing, and the base URL configuration.

## License

See the repository root for license information.
