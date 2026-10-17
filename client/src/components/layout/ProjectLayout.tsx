import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { formatDateID } from '@gantt/shared';
import { useProject } from '../../hooks/useProjectData.js';
import { ErrorState, PageLoader, ProgressBar } from '../ui/States.js';
import { Button } from '../ui/Button.js';

const TABS = [
  { to: 'gantt', label: 'Gantt Chart' },
  { to: 'team', label: 'Tim & Biaya' },
  { to: 'calendar', label: 'Kalender' },
  { to: 'analysis', label: 'Analisis' },
];

export function ProjectLayout() {
  const { id = '' } = useParams();
  const query = useProject(id);

  if (query.isLoading) return <PageLoader label="Memuat proyek..." />;
  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <Link to="/projects" className="text-sm font-medium text-brand-600 hover:underline">
          ← Kembali ke daftar proyek
        </Link>
        <ErrorState
          title="Proyek tidak dapat dibuka"
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Proyek tidak ditemukan atau bukan milik akun Anda.'
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const { project, metrics } = query.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/projects"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-brand-600"
          >
            ← Semua proyek
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
          <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-slate-500">
            {project.description || 'Tidak ada deskripsi.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Mulai {formatDateID(project.startDate)}</span>
            <span>Selesai {metrics.endDate ? formatDateID(metrics.endDate) : '—'}</span>
            <span>{metrics.taskCount} tugas</span>
          </div>
        </div>
        <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Progres proyek</span>
            <span className="font-semibold text-slate-800">{metrics.progress}%</span>
          </div>
          <ProgressBar value={metrics.progress} className="mt-2" />
          <div className="mt-3 flex justify-between text-xs text-slate-500">
            <span>{metrics.leafCount} tugas daun</span>
            <span>{metrics.totalWorkingDays} hari kerja</span>
          </div>
        </div>
      </div>

      <nav className="no-print flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
        <div className="ml-auto hidden items-center pr-2 sm:flex">
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Muat ulang
          </Button>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
