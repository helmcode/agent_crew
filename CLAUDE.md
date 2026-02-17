# AgentCrew Frontend - AI Assistant Context

## Project Overview

React SPA for managing multi-agent AI teams. Users create teams of AI agents, configure their roles and skills, deploy them on Docker or Kubernetes, and monitor activity in real-time.

## Architecture

- **Framework:** React 19 + TypeScript, bundled with Vite 7
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/vite` plugin, no `tailwind.config` file)
- **Routing:** React Router v6 with `BrowserRouter`
- **State:** Local component state with `useState`/`useCallback` (no global state library)
- **Testing:** Vitest + Testing Library + jsdom

## Key Patterns

### API Client (`src/services/api.ts`)
- Centralized `request<T>()` function handles all HTTP calls
- Base URL from `VITE_API_URL` env var (default: `http://localhost:3000`)
- Exported API objects: `teamsApi`, `agentsApi`, `chatApi`, `messagesApi`, `settingsApi`

### WebSocket (`src/services/websocket.ts`)
- `connectTeamActivity()` and `connectAgentLogs()` for real-time streams
- Auto-reconnect with exponential backoff (max 10 retries, up to 30s delay)
- Returns a disconnect function for cleanup in `useEffect`

### Component Organization
- `src/pages/` — Route-level components (one per route)
- `src/components/` — Reusable UI components (Layout, StatusBadge, Toast, etc.)
- `src/types/index.ts` — All shared TypeScript interfaces

### Toast System (`src/components/Toast.tsx`)
- Global `toast(type, message)` function (no context/provider needed)
- Auto-dismiss after 4 seconds

### Runtime Support
- `RUNTIMES` array in `TeamBuilderPage.tsx` defines available runtimes: `docker`, `kubernetes`
- Runtime-aware labels throughout UI (e.g., "Pod Status" vs "Container Status")
- Visual indicators: emoji badges for runtime type

## Type Definitions (`src/types/index.ts`)
- `Team` — id, name, description, status, runtime, workspace_path, agents[]
- `Agent` — id, name, role (leader/worker), specialty, container_status
- `TaskLog` — WebSocket activity messages
- `TeamStatus` — stopped | deploying | running | error
- `ContainerStatus` — stopped | running | error

## Important Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Router setup with all routes |
| `src/services/api.ts` | REST API client |
| `src/services/websocket.ts` | WebSocket client |
| `src/types/index.ts` | All TypeScript types |
| `src/components/Layout.tsx` | App shell with navigation |
| `src/pages/TeamBuilderPage.tsx` | 3-step team creation wizard |
| `src/pages/TeamMonitorPage.tsx` | Real-time monitoring dashboard |
| `src/pages/TeamsListPage.tsx` | Teams list/dashboard |
| `src/pages/SettingsPage.tsx` | Key-value settings manager |
| `src/test/mocks.ts` | Mock data for tests |
| `Dockerfile` | Multi-stage build (node -> nginx) |
| `nginx.conf` | SPA-friendly nginx config |

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Type-check + production build
npm test             # Run unit tests (vitest)
npm run test:watch   # Tests in watch mode
npm run lint         # ESLint
```

## Conventions

- All code and comments in English
- Tailwind CSS utility classes (no separate CSS files beyond `index.css`)
- Co-located test files (`Component.test.tsx` next to `Component.tsx`)
- No external icon libraries — emojis or inline SVGs for icons
- Dark theme (slate-900/950 backgrounds, slate-300/400 text)
