import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  {
    to: '/',
    label: 'Teams',
    end: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/schedules',
    label: 'Schedules',
    end: false,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/webhooks',
    label: 'Webhooks',
    end: false,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-4.122a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
      </svg>
    ),
  },
  {
    to: '/post-actions',
    label: 'Post-Actions',
    end: false,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z" />
      </svg>
    ),
  },
  {
    to: '/knowledge',
    label: 'Knowledge Base',
    end: false,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Variables',
    end: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 003 12c0 3.183.62 6.22 1.745 9M19.255 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444-.89a.75.75 0 011.105.402l2.402 7.206a.75.75 0 001.105.401l1.444-.889" />
      </svg>
    ),
  },
];

const settingsNavItems = [
  {
    to: '/settings/profile',
    label: 'Profile',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    to: '/settings/organization',
    label: 'Organization',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
];

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, organization, authConfig, logout } = useAuth();

  const showNewTeamButton = location.pathname !== '/' && location.pathname !== '/teams/new';
  const showAuthNav = authConfig?.provider !== 'noop';

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
        <svg className="h-7 w-auto" viewBox="0 0 280 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="sidebar-bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6"/>
              <stop offset="100%" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>
          <rect width="44" height="44" y="6" rx="9" fill="url(#sidebar-bg)"/>
          <line x1="19" y1="27" x2="13" y2="19" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
          <line x1="19" y1="27" x2="33" y2="20" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
          <line x1="19" y1="27" x2="12" y2="39" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
          <line x1="19" y1="27" x2="34" y2="40" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
          <line x1="13" y1="19" x2="33" y2="20" stroke="white" strokeWidth="0.5" opacity="0.15" strokeLinecap="round"/>
          <line x1="12" y1="39" x2="34" y2="40" stroke="white" strokeWidth="0.5" opacity="0.15" strokeLinecap="round"/>
          <circle cx="19" cy="27" r="7" fill="white" opacity="0.12"/>
          <circle cx="19" cy="27" r="5" fill="white" opacity="0.95"/>
          <circle cx="13" cy="19" r="3" fill="white" opacity="0.85"/>
          <circle cx="33" cy="20" r="3.3" fill="white" opacity="0.9"/>
          <circle cx="12" cy="39" r="2.8" fill="white" opacity="0.8"/>
          <circle cx="34" cy="40" r="3.1" fill="white" opacity="0.85"/>
          <circle cx="7" cy="30" r="1" fill="white" opacity="0.2"/>
          <circle cx="39" cy="31" r="1.1" fill="white" opacity="0.18"/>
          <text x="56" y="34" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontSize="22" fontWeight="600" fill="white">AgentCrew</text>
        </svg>
        <div className="flex flex-col">
          {showAuthNav && organization && (
            <span className="text-xs text-slate-400">{organization.name}</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {showNewTeamButton && (
          <button
            onClick={() => {
              navigate('/teams/new');
              setMobileOpen(false);
            }}
            className="mb-1 flex items-center gap-3 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Team
          </button>
        )}
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        {/* Settings group (only when auth is active) */}
        {showAuthNav && (
          <>
            <div className="my-2 border-t border-slate-800" />
            <span className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Settings
            </span>
            {settingsNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User footer (only when auth is active) */}
      {showAuthNav && user && (
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-slate-800 bg-slate-900 transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col md:ml-64">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center border-b border-slate-800 bg-slate-900/80 px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle sidebar"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <svg className="ml-3 h-6 w-auto" viewBox="0 0 280 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="mobile-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6"/>
                <stop offset="100%" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
            <rect width="44" height="44" y="6" rx="9" fill="url(#mobile-bg)"/>
            <line x1="19" y1="27" x2="13" y2="19" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
            <line x1="19" y1="27" x2="33" y2="20" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
            <line x1="19" y1="27" x2="12" y2="39" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
            <line x1="19" y1="27" x2="34" y2="40" stroke="white" strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
            <line x1="13" y1="19" x2="33" y2="20" stroke="white" strokeWidth="0.5" opacity="0.15" strokeLinecap="round"/>
            <line x1="12" y1="39" x2="34" y2="40" stroke="white" strokeWidth="0.5" opacity="0.15" strokeLinecap="round"/>
            <circle cx="19" cy="27" r="7" fill="white" opacity="0.12"/>
            <circle cx="19" cy="27" r="5" fill="white" opacity="0.95"/>
            <circle cx="13" cy="19" r="3" fill="white" opacity="0.85"/>
            <circle cx="33" cy="20" r="3.3" fill="white" opacity="0.9"/>
            <circle cx="12" cy="39" r="2.8" fill="white" opacity="0.8"/>
            <circle cx="34" cy="40" r="3.1" fill="white" opacity="0.85"/>
            <circle cx="7" cy="30" r="1" fill="white" opacity="0.2"/>
            <circle cx="39" cy="31" r="1.1" fill="white" opacity="0.18"/>
            <text x="56" y="34" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontSize="22" fontWeight="600" fill="white">AgentCrew</text>
          </svg>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
