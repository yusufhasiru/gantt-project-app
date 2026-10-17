import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDateID } from '@gantt/shared';
import type { ProjectSummary } from '../api/types.js';
import { useProjectActions, useProjects } from '../hooks/useProjectData.js';
import { useAuth } from '../hooks/useAuth.js';
import { formatCurrency, formatPercent } from '../lib/format.js';
import { Button } from '../components/ui/Button.js';
import { EmptyState, ErrorState, PageLoader, ProgressBar } from '../components/ui/States.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { ProjectFormDialog } from '../components/projects/ProjectFormDialog.js';
import { useToast } from '../components/ui/Toast.js';

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: ProjectSummary;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { metrics } = project;
  return (
    <article className="card-base flex flex-col p-5 transition hover:border-brand-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">{project.name}</h2>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
            {project.description || 'Tidak ada deskripsi.'}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h9M7 12h9M10 18h9" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div>
          <p className="uppercase tracking-wide text-slate-400">Mulai</p>
          <p className="mt-0.5 font-medium text-slate-700">{formatDateID(project.startDate)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-slate-400">Selesai</p>
          <p className="mt-0.5 font-medium text-slate-700">
            {metrics.endDate ? formatDateID(metrics.endDate) : 'Belum dijadwalkan'}
          </p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-slate-400">Jumlah tugas</p>
          <p className="mt-0.5 font-medium text-slate-700">
            {metrics.taskCount} ({metrics.leafCount} daun)
          </p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-slate-400">Estimasi biaya</p>
          <p className="mt-0.5 font-medium text-slate-700">{formatCurrency(metrics.totalCost)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Progres</span>
          <span className="font-semibold text-slate-700">{formatPercent(metrics.progress)}</span>
        </div>
        <ProgressBar value={metrics.progress} className="mt-1.5" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <Link
          to={`/projects/${project.id}/gantt`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700"
        >
          Buka Gantt
          <span aria-hidden="true">→</span>
        </Link>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="dangerOutline" size="sm" onClick={onDelete} className="ml-auto">
          Hapus
        </Button>
      </div>
    </article>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const projectsQuery = useProjects();
  const { deleteProject } = useProjectActions();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);

  if (projectsQuery.isLoading) return <PageLoader label="Memuat daftar proyek..." />;
  if (projectsQuery.isError) {
    return (
      <ErrorState
        message={projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Gagal memuat proyek.'}
        onRetry={() => void projectsQuery.refetch()}
      />
    );
  }

  const projects = projectsQuery.data?.projects ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-brand-600">Dasbor</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Selamat datang, {user?.name?.split(' ')[0] ?? 'Pengguna'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Kelola proyek, atur jadwal dengan Gantt Chart, dan pantau jalur kritis serta biaya tim.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          icon={
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 4v12M4 10h12" strokeLinecap="round" />
            </svg>
          }
        >
          Proyek baru
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="Belum ada proyek"
          description="Mulai dengan membuat proyek pertama Anda. Setelah dibuat, Anda dapat menambahkan tugas, dependensi, anggota tim, dan melihat analisis jadwal."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Buat proyek pertama
            </Button>
          }
          icon={
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 6h9M7 12h9M10 18h9" strokeLinecap="round" />
              <path d="M4 6v12" strokeLinecap="round" opacity="0.5" />
            </svg>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={() => {
                setEditing(project);
                setFormOpen(true);
              }}
              onDelete={() => setDeleting(project)}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={formOpen}
        project={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onCreated={(snapshot) => navigate(`/projects/${snapshot.project.id}/gantt`)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus proyek?"
        message={`Proyek "${deleting?.name ?? ''}" beserta seluruh tugas, dependensi, anggota, alokasi, dan hari libur akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus proyek"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteProject.mutateAsync(deleting.id);
            showToast('Proyek berhasil dihapus.');
            setDeleting(null);
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Gagal menghapus proyek.', 'error');
          }
        }}
      />
    </div>
  );
}
