import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastContainer } from './components/Toast';
import { TeamsListPage } from './pages/TeamsListPage';
import { TeamBuilderPage } from './pages/TeamBuilderPage';
import { TeamMonitorPage } from './pages/TeamMonitorPage';
import { SchedulesListPage } from './pages/SchedulesListPage';
import { ScheduleBuilderPage } from './pages/ScheduleBuilderPage';
import { ScheduleDetailPage } from './pages/ScheduleDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { WebhooksListPage } from './pages/WebhooksListPage';
import { WebhookBuilderPage } from './pages/WebhookBuilderPage';
import { WebhookDetailPage } from './pages/WebhookDetailPage';
import { PostActionsListPage } from './pages/PostActionsListPage';
import { PostActionBuilderPage } from './pages/PostActionBuilderPage';
import { PostActionDetailPage } from './pages/PostActionDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InvitePage } from './pages/InvitePage';
import { UserProfilePage } from './pages/UserProfilePage';
import { OrgSettingsPage } from './pages/OrgSettingsPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';

function GuardedRoute({ children }: { children: React.ReactNode }) {
  const { mustChangePassword } = useAuth();
  if (mustChangePassword) return <Navigate to="/settings/profile" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { authConfig, isAuthenticated, isLoading, refreshUser } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  const showAuthPages = authConfig?.provider !== 'noop';

  return (
    <Routes>
      {/* Public auth routes — only when auth is active */}
      {showAuthPages && (
        <>
          <Route
            path="/login"
            element={
              isAuthenticated
                ? <Navigate to="/" replace />
                : <LoginPage authConfig={authConfig!} onLoginSuccess={refreshUser} />
            }
          />
          <Route
            path="/register"
            element={
              isAuthenticated
                ? <Navigate to="/" replace />
                : authConfig!.registration_enabled
                  ? <RegisterPage onRegisterSuccess={refreshUser} />
                  : <Navigate to="/login" replace />
            }
          />
          <Route path="/invite/:token" element={<InvitePage />} />
        </>
      )}

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<GuardedRoute><TeamsListPage /></GuardedRoute>} />
        <Route path="/teams/new" element={<GuardedRoute><TeamBuilderPage /></GuardedRoute>} />
        <Route path="/teams/:id" element={<GuardedRoute><TeamMonitorPage /></GuardedRoute>} />
        <Route path="/schedules" element={<GuardedRoute><SchedulesListPage /></GuardedRoute>} />
        <Route path="/schedules/new" element={<GuardedRoute><ScheduleBuilderPage /></GuardedRoute>} />
        <Route path="/schedules/:id" element={<GuardedRoute><ScheduleDetailPage /></GuardedRoute>} />
        <Route path="/webhooks" element={<GuardedRoute><WebhooksListPage /></GuardedRoute>} />
        <Route path="/webhooks/new" element={<GuardedRoute><WebhookBuilderPage /></GuardedRoute>} />
        <Route path="/webhooks/:id" element={<GuardedRoute><WebhookDetailPage /></GuardedRoute>} />
        <Route path="/post-actions" element={<GuardedRoute><PostActionsListPage /></GuardedRoute>} />
        <Route path="/post-actions/new" element={<GuardedRoute><PostActionBuilderPage /></GuardedRoute>} />
        <Route path="/post-actions/:id" element={<GuardedRoute><PostActionDetailPage /></GuardedRoute>} />
        <Route path="/knowledge" element={<GuardedRoute><KnowledgeBasePage /></GuardedRoute>} />
        <Route path="/settings" element={<GuardedRoute><SettingsPage /></GuardedRoute>} />
        <Route path="/settings/profile" element={<UserProfilePage />} />
        <Route path="/settings/organization" element={<GuardedRoute><OrgSettingsPage /></GuardedRoute>} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <ToastContainer />
      </AuthProvider>
    </BrowserRouter>
  );
}
