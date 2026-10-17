import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  computeCostBreakdown,
  computeWorkload,
  formatDateID,
  type ResourceRecord,
} from '@gantt/shared';
import { useProject, useProjectMutations } from '../hooks/useProjectData.js';
import { formatCurrency } from '../lib/format.js';
import { Button } from '../components/ui/Button.js';
import { Badge, EmptyState, ErrorState, PageLoader, StatCard } from '../components/ui/States.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { ResourceFormDialog } from '../components/team/ResourceFormDialog.js';
import { useToast } from '../components/ui/Toast.js';

export function TeamPage() {
  const { id = '' } = useParams();
  const query = useProject(id);
  const { deleteResource } = useProjectMutations(id);
  const { showToast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRecord | null>(null);
  const [deleting, setDeleting] = useState<ResourceRecord | null>(null);

  const derived = useMemo(() => {
    if (!query.data) return null;
    const { tasks, resources, assignments, project } = query.data;
    const calendar = {
      weekendDays: project.weekendDays,
      holidays: project.holidays.map((holiday) => holiday.date),
    };
    const cost = computeCostBreakdown(tasks, resources, assignments);
    const workload = computeWorkload(tasks, resources, assignments, calendar);
    const costByResource = new Map(cost.byResource.map((row) => [row.resourceId, row]));
    const tasksByResource = new Map<string, Array<{ id: string; name: string; percent: number }>>();
    for (const assignment of assignments) {
      const task = tasks.find((item) => item.id === assignment.taskId);
      if (!task) continue;
      const list = tasksByResource.get(assignment.resourceId) ?? [];
      list.push({ id: task.id, name: task.name, percent: assignment.allocationPercent });
      tasksByResource.set(assignment.resourceId, list);
    }
    const overAllocatedResources = new Set(workload.overAllocations.map((row) => row.resourceId));
    return { cost, workload, costByResource, tasksByResource, overAllocatedResources, calendar };
  }, [query.data]);

  if (query.isLoading) return <PageLoader label="Memuat data tim..." />;
  if (query.isError || !query.data || !derived) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat data tim.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { project, resources, metrics } = query.data;
  const { cost, workload, costByResource, tasksByResource, overAllocatedResources } = derived;
  const warningRows = workload.overAllocations.slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total estimasi biaya" value={formatCurrency(cost.total)} hint="Hanya tugas daun" />
        <StatCard label="Anggota tim" value={resources.length} hint={`${query.data.assignments.length} alokasi aktif`} />
        <StatCard
          label="Risiko over-alokasi"
          value={overAllocatedResources.size}
          hint="Anggota yang melebihi 100% pada suatu hari"
          tone={overAllocatedResources.size > 0 ? 'danger' : 'neutral'}
        />
        <StatCard
          label="Akhir proyek"
          value={metrics.endDate ? formatDateID(metrics.endDate) : '—'}
          hint={`${metrics.totalWorkingDays} hari kerja`}
        />
      </div>

      {workload.overAllocations.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-amber-600" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-amber-900">
                Peringatan over-alokasi ({workload.overAllocations.length} hari kerja)
              </h2>
              <p className="mt-0.5 text-xs text-amber-800">
                Total alokasi anggota melebihi 100% pada hari yang sama. Sesuaikan tanggal atau persentase
                alokasi untuk menghindari beban berlebih.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {warningRows.map((row) => (
                  <li key={`${row.resourceId}-${row.date}`}>
                    <span className="font-medium">{row.resourceName}</span> · {formatDateID(row.date)} ·{' '}
                    {row.totalPercent}%
                  </li>
                ))}
                {workload.overAllocations.length > warningRows.length ? (
                  <li className="text-amber-700">…dan {workload.overAllocations.length - warningRows.length} lainnya.</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Anggota tim</h2>
          <p className="text-sm text-slate-500">
            Gaji bulanan dihitung menjadi tarif harian (÷ 22) untuk estimasi biaya tugas.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Tambah anggota
        </Button>
      </div>

      {resources.length === 0 ? (
        <EmptyState
          title="Belum ada anggota tim"
          description="Tambahkan anggota dengan peran dan gaji bulanan. Setelah itu Anda dapat mengalokasikan mereka ke tugas pada halaman Gantt."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Tambah anggota pertama
            </Button>
          }
        />
      ) : (
        <div className="card-base overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Anggota</th>
                <th className="px-4 py-3 font-semibold">Peran</th>
                <th className="px-4 py-3 text-right font-semibold">Gaji / bulan</th>
                <th className="px-4 py-3 font-semibold">Tugas dialokasikan</th>
                <th className="px-4 py-3 text-right font-semibold">Beban puncak</th>
                <th className="px-4 py-3 text-right font-semibold">Total biaya</th>
                <th className="px-4 py-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resources.map((resource) => {
                const allocated = tasksByResource.get(resource.id) ?? [];
                const peak = workload.peakByResource[resource.id] ?? 0;
                const overAllocated = overAllocatedResources.has(resource.id);
                return (
                  <tr key={resource.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {resource.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{resource.name}</p>
                          <p className="truncate text-xs text-slate-500">{resource.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{resource.role}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {formatCurrency(resource.salary)}
                    </td>
                    <td className="px-4 py-3">
                      {allocated.length === 0 ? (
                        <span className="text-xs text-slate-400">Belum dialokasikan</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {allocated.slice(0, 3).map((task) => (
                            <Badge key={task.id} tone="neutral">
                              {task.name} · {task.percent}%
                            </Badge>
                          ))}
                          {allocated.length > 3 ? (
                            <Badge tone="info">+{allocated.length - 3}</Badge>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          overAllocated
                            ? 'bg-rose-50 text-rose-700'
                            : peak > 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {peak}%
                      </span>
                      {overAllocated ? (
                        <p className="mt-1 text-[10px] font-medium text-rose-600">Over-alokasi</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                      {formatCurrency(costByResource.get(resource.id)?.cost ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(resource);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="dangerOutline" onClick={() => setDeleting(resource)}>
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total biaya proyek
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                  {formatCurrency(cost.total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ResourceFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        projectId={project.id}
        resource={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus anggota tim?"
        message={`Anggota "${deleting?.name ?? ''}" dan seluruh alokasinya akan dihapus. Biaya proyek akan dihitung ulang.`}
        confirmLabel="Hapus anggota"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteResource.mutateAsync(deleting.id);
            showToast('Anggota tim dihapus.');
            setDeleting(null);
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Gagal menghapus anggota.', 'error');
          }
        }}
      />
    </div>
  );
}
