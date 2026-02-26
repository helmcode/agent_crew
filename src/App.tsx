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
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
