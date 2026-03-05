import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TeamsListPage />} />
          <Route path="/teams/new" element={<TeamBuilderPage />} />
          <Route path="/teams/:id" element={<TeamMonitorPage />} />
          <Route path="/schedules" element={<SchedulesListPage />} />
          <Route path="/schedules/new" element={<ScheduleBuilderPage />} />
          <Route path="/schedules/:id" element={<ScheduleDetailPage />} />
          <Route path="/webhooks" element={<WebhooksListPage />} />
          <Route path="/webhooks/new" element={<WebhookBuilderPage />} />
          <Route path="/webhooks/:id" element={<WebhookDetailPage />} />
          <Route path="/post-actions" element={<PostActionsListPage />} />
          <Route path="/post-actions/new" element={<PostActionBuilderPage />} />
          <Route path="/post-actions/:id" element={<PostActionDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
