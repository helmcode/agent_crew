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
- `agentsApi.installSkill(teamId, agentId, {repo_url, skill_name})` — installs a skill on a running agent

### WebSocket (`src/services/websocket.ts`)
- `connectTeamActivity()` and `connectAgentLogs()` for real-time streams
- Auto-reconnect with exponential backoff (max 10 retries, up to 30s delay)
- Returns a disconnect function for cleanup in `useEffect`
- `skill_status` messages trigger `fetchTeam()` to refresh the UI immediately (both success and failure)

### Component Organization
- `src/pages/` — Route-level components (one per route)
- `src/components/` — Reusable UI components (Layout, StatusBadge, Toast, SkillStatusPanel, etc.)
- `src/types/index.ts` — All shared TypeScript interfaces

### Toast System (`src/components/Toast.tsx`)
- Global `toast(type, message)` function (no context/provider needed)
- Auto-dismiss after 4 seconds

### Runtime Support
- `RUNTIMES` array in `TeamBuilderPage.tsx` defines available runtimes: `docker`, `kubernetes`
- Runtime-aware labels throughout UI (e.g., "Pod Status" vs "Container Status")
- Visual indicators: emoji badges for runtime type

### Skills Management
- **Team creation (TeamBuilderPage):** Both leaders and workers can have skills configured in Step 2. Leader skills are labeled "Global Skills (shared with all agents)".
- **Running teams (SkillStatusPanel):** The Settings modal allows installing skills on any agent (leaders and workers). Leader shows "(global)" in the dropdown.
- **Real-time updates:** After installing a skill, `fetchTeam()` is called to refresh `skill_statuses`. WebSocket `skill_status` messages also trigger a refresh.
- **Status tracking:** Each agent has `skill_statuses[]` (name, status: installed|pending|failed, error?) displayed in the SkillStatusPanel.

## Type Definitions (`src/types/index.ts`)
- `Team` — id, name, description, status, runtime, workspace_path, agents[]
- `Agent` — id, name, role (leader/worker), specialty, container_status, skill_statuses[], sub_agent_skills[]
- `SkillStatus` — name, status (pending|installed|failed), error?
- `SkillConfig` — repo_url, skill_name
- `TaskLog` — WebSocket activity messages (includes skill_status, container_validation types)
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
| `src/components/SkillStatusPanel.tsx` | Skill status display, Settings modal with install form |
| `src/pages/TeamBuilderPage.tsx` | 3-step team creation wizard (leader + worker skills) |
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
- Agent names must be unique within a team (enforced by the backend, case-insensitive)
