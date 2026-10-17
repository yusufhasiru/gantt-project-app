import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { ProjectLayout } from './components/layout/ProjectLayout.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { GanttPage } from './pages/GanttPage.js';
import { TeamPage } from './pages/TeamPage.js';
import { CalendarPage } from './pages/CalendarPage.js';
import { AnalysisPage } from './pages/AnalysisPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { PageLoader } from './components/ui/States.js';

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <PageLoader label="Memeriksa sesi..." />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectLayout />}>
            <Route index element={<Navigate to="gantt" replace />} />
            <Route path="gantt" element={<GanttPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="analysis" element={<AnalysisPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
