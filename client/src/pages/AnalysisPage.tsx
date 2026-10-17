import { Link, useParams } from 'react-router-dom';
import { formatDateID } from '@gantt/shared';
import { useAnalysis, useProject } from '../hooks/useProjectData.js';
import { formatCurrency } from '../lib/format.js';
import { Badge, EmptyState, ErrorState, PageLoader, StatCard } from '../components/ui/States.js';
import { PertDiagram } from '../components/pert/PertDiagram.js';

export function AnalysisPage() {
  const { id = '' } = useParams();
  const projectQuery = useProject(id);
  const analysisQuery = useAnalysis(id);

  if (projectQuery.isLoading || analysisQuery.isLoading) {
    return <PageLoader label="Menghitung analisis proyek..." />;
  }
  if (projectQuery.isError || analysisQuery.isError || !projectQuery.data || !analysisQuery.data) {
    const error = projectQuery.error ?? analysisQuery.error;
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Gagal memuat analisis proyek.'}
        onRetry={() => {
          void projectQuery.refetch();
          void analysisQuery.refetch();
        }}
      />
    );
  }

  const snapshot = projectQuery.data;
  const analysis = analysisQuery.data;
  const { cpm, pert, cost, workload, metrics } = analysis;
  const taskById = new Map(cpm.tasks.map((task) => [task.id, task]));
  const resourceById = new Map(snapshot.resources.map((resource) => [resource.id, resource]));
  const overAllocatedResources = new Set(workload.overAllocations.map((row) => row.resourceId));

  if (snapshot.tasks.length === 0) {
    return (
      <EmptyState
        title="Belum ada tugas untuk dianalisis"
        description="Tambahkan tugas pada Gantt Chart. Setelah itu jalur kritis, diagram PERT, biaya, dan beban kerja akan muncul di sini."
        action={
          <Link
            to={`/projects/${id}/gantt`}
            className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Buka Gantt Chart
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Mulai proyek" value={formatDateID(analysis.projectStart)} />
        <StatCard
          label="Selesai proyek (CPM)"
          value={cpm.projectEndDate ? formatDateID(cpm.projectEndDate) : '—'}
          hint={`${metrics.totalWorkingDays} hari kerja`}
        />
        <StatCard
          label="Tugas kritis"
          value={`${cpm.criticalIds.length} / ${cpm.tasks.length}`}
          hint={`${cpm.criticalPaths.length} jalur kritis terdeteksi`}
        />
        <StatCard
          label="Estimasi biaya"
          value={formatCurrency(cost.total)}
          hint={`${workload.overAllocations.length} peringatan over-alokasi`}
          tone={workload.overAllocations.length > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {cpm.hasNegativeFloat ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Terdapat tugas dengan total float negatif. Periksa kembali batas tanggal dan lag dependensi.
        </div>
      ) : null}

      <section className="card-base p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Jalur kritis</h2>
            <p className="mt-1 text-sm text-slate-500">
              Rangkaian tugas dengan total float nol. Keterlambatan pada salah satunya menunda akhir proyek.
            </p>
          </div>
          <Badge tone={cpm.criticalIds.length > 0 ? 'danger' : 'neutral'}>
            {cpm.criticalIds.length} tugas kritis
          </Badge>
        </div>
        {cpm.criticalPaths.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
            Tidak ada jalur kritis yang terdeteksi.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {cpm.criticalPaths.map((path, index) => (
              <li key={`path-${index}`} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-rose-50/60 p-2.5">
                <span className="mr-1 text-xs font-semibold uppercase text-rose-700">Jalur {index + 1}</span>
                {path.map((taskId, taskIndex) => (
                  <span key={taskId} className="flex items-center gap-1.5">
                    {taskIndex > 0 ? <span className="text-rose-300">→</span> : null}
                    <span className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-xs font-medium text-rose-800">
                      {taskById.get(taskId)?.name ?? taskId}
                    </span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-base overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Tabel CPM</h2>
          <p className="mt-1 text-sm text-slate-500">
            ES/EF/LS/LF memakai ordinal hari kerja; ordinal 0 adalah hari kerja pertama proyek.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Tugas</th>
                <th className="px-4 py-2.5 text-right font-semibold">Durasi</th>
                <th className="px-4 py-2.5 text-right font-semibold">ES</th>
                <th className="px-4 py-2.5 text-right font-semibold">EF</th>
                <th className="px-4 py-2.5 text-right font-semibold">LS</th>
                <th className="px-4 py-2.5 text-right font-semibold">LF</th>
                <th className="px-4 py-2.5 text-right font-semibold">Float</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cpm.tasks.map((task) => (
                <tr key={task.id} className={task.critical ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}>
                  <td className="px-4 py-2.5">
                    <span className={task.critical ? 'font-medium text-rose-800' : 'text-slate-700'}>
                      {task.name}
                    </span>
                    <p className="text-[11px] text-slate-400">
                      {formatDateID(task.scheduledStart)} – {formatDateID(task.scheduledEnd)}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{task.durationDays}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{task.es}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{task.ef}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{task.ls}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{task.lf}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{task.totalFloat}</td>
                  <td className="px-4 py-2.5">
                    {task.critical ? <Badge tone="danger">Kritis</Badge> : <Badge tone="neutral">Float</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-base p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Diagram PERT</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Activity-on-node dari tugas daun. Node kritis dan panah penghubungnya berwarna merah.
            </p>
          </div>
          <Badge tone={pert.available ? 'success' : 'warning'}>
            {pert.available ? 'Estimasi lengkap' : 'Estimasi belum lengkap'}
          </Badge>
        </div>

        <div className="mt-4">
          <PertDiagram nodes={cpm.tasks} dependencies={snapshot.dependencies} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Estimasi durasi</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {pert.available && pert.projectExpectedDays != null
                ? `${pert.projectExpectedDays.toFixed(2)} hari`
                : 'Tidak tersedia'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total variansi</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {pert.available && pert.projectVariance != null ? pert.projectVariance.toFixed(3) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Simpangan baku</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {pert.available && pert.projectStandardDeviation != null
                ? `${pert.projectStandardDeviation.toFixed(2)} hari`
                : '—'}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{pert.assumption}</p>
        {!pert.available ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {pert.criticalPathIds.length === 0
              ? 'Belum ada tugas kritis yang dapat diestimasi.'
              : `Isi estimasi optimistis dan pesimistis pada seluruh ${pert.criticalPathIds.length} tugas jalur kritis. Nilai proyek tidak ditampilkan agar tidak menyesatkan.`}
          </p>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card-base p-5">
          <h2 className="text-base font-semibold text-slate-900">Biaya per anggota</h2>
          <p className="mt-1 text-sm text-slate-500">Berdasarkan tarif harian dan durasi tugas daun.</p>
          <div className="mt-4 space-y-2">
            {cost.byResource.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada alokasi anggota.</p>
            ) : (
              cost.byResource.map((row) => (
                <div key={row.resourceId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {resourceById.get(row.resourceId)?.name ?? row.name}
                    </p>
                    <p className="text-xs text-slate-500">{row.role} · {row.allocationCount} alokasi</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-900">
                    {formatCurrency(row.cost)}
                  </span>
                </div>
              ))
            )}
            {cost.byResource.length > 0 ? (
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(cost.total)}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="card-base p-5">
          <h2 className="text-base font-semibold text-slate-900">Beban kerja</h2>
          <p className="mt-1 text-sm text-slate-500">
            Peringatan muncul bila total alokasi seorang anggota melebihi 100% pada hari kerja yang sama.
          </p>
          {workload.overAllocations.length === 0 ? (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              Tidak ada over-alokasi terdeteksi.
            </p>
          ) : (
            <>
              <p className="mt-3 text-xs font-medium text-rose-700">
                {overAllocatedResources.size} anggota terpengaruh · {workload.overAllocations.length} hari kerja
              </p>
              <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {workload.overAllocations.map((row) => (
                  <li
                    key={`${row.resourceId}-${row.date}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-1.5 text-xs"
                  >
                    <span className="truncate text-slate-700">
                      <span className="font-medium">{row.resourceName}</span> · {formatDateID(row.date)}
                    </span>
                    <span className="shrink-0 font-semibold text-rose-700">{row.totalPercent}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
