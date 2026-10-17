import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Button } from '../ui/Button.js';

export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h9M7 12h9M10 18h9" strokeLinecap="round" />
        <path d="M4 6v12" strokeLinecap="round" opacity="0.6" />
      </svg>
    </span>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 px-4 py-3">
          <Link to="/projects" className="flex items-center gap-2.5 rounded-lg" aria-label="GanttFlow — daftar proyek">
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Gantt<span className="text-brand-600">Flow</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="no-print border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        GanttFlow — manajemen proyek dengan Gantt Chart, CPM, dan PERT.
      </footer>
    </div>
  );
}
