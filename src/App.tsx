import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastContainer } from './components/Toast';
import { TeamsListPage } from './pages/TeamsListPage';
import { TeamBuilderPage } from './pages/TeamBuilderPage';
import { TeamMonitorPage } from './pages/TeamMonitorPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TeamsListPage />} />
          <Route path="/teams/new" element={<TeamBuilderPage />} />
          <Route path="/teams/:id" element={<TeamMonitorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
