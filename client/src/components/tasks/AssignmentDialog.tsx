import { useState } from 'react';
import { Link } from 'react-router-dom';
import { computeTaskCost, dailyRate, type AssignmentRecord, type ResourceRecord, type TaskRecord } from '@gantt/shared';
import { useProjectMutations } from '../../hooks/useProjectData.js';
import { formatCurrency } from '../../lib/format.js';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { Field, inputClass } from '../ui/Field.js';
import { EmptyState } from '../ui/States.js';
import { useToast } from '../ui/Toast.js';

interface AssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  task: TaskRecord;
  resources: ResourceRecord[];
  assignments: AssignmentRecord[];
}

export function AssignmentDialog({
  open,
  onClose,
  projectId,
  task,
  resources,
  assignments,
}: AssignmentDialogProps) {
  const { addAssignment, updateAssignment, deleteAssignment } = useProjectMutations(projectId);
  const { showToast } = useToast();
  const [resourceId, setResourceId] = useState('');
  const [percent, setPercent] = useState('100');
  const [error, setError] = useState<string | null>(null);

  const taskAssignments = assignments.filter((assignment) => assignment.taskId === task.id);
  const assignedResourceIds = new Set(taskAssignments.map((assignment) => assignment.resourceId));
  const availableResources = resources.filter((resource) => !assignedResourceIds.has(resource.id));
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const totalCost = computeTaskCost(task, taskAssignments, resourcesById);

  const handleAdd = async () => {
    setError(null);
    if (!resourceId) {
      setError('Pilih anggota terlebih dahulu.');
      return;
    }
    const allocation = Number(percent);
    if (!Number.isInteger(allocation) || allocation < 1 || allocation > 100) {
      setError('Alokasi harus bilangan bulat 1-100%.');
      return;
    }
    try {
      await addAssignment.mutateAsync({
        id: task.id,
        input: { resourceId, allocationPercent: allocation },
      });
      showToast('Anggota dialokasikan ke tugas.');
      setResourceId('');
      setPercent('100');
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Gagal menambah alokasi.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Alokasi tim — ${task.name}`}
      description={`Durasi ${task.durationDays} hari kerja. Biaya tugas memperhitungkan gaji bulanan dan persentase alokasi.`}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between text-sm">
          <span className="text-slate-500">Estimasi biaya tugas</span>
          <span className="font-semibold text-slate-900">{formatCurrency(totalCost)}</span>
        </div>
      }
    >
      <div className="space-y-5">
        {resources.length === 0 ? (
          <EmptyState
            title="Belum ada anggota tim"
            description="Tambahkan anggota tim terlebih dahulu untuk dapat mengalokasikan pekerjaan."
            action={
              <Link
                to={`/projects/${projectId}/team`}
                className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Buka halaman Tim
              </Link>
            }
          />
        ) : (
          <>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Anggota pada tugas ini</h3>
              {taskAssignments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                  Belum ada anggota yang dialokasikan.
                </p>
              ) : (
                <ul className="space-y-2">
                  {taskAssignments.map((assignment) => {
                    const resource = resourcesById.get(assignment.resourceId);
                    return (
                      <AssignmentRow
                        key={assignment.id}
                        assignment={assignment}
                        resourceName={resource?.name ?? 'Anggota tidak dikenal'}
                        role={resource?.role ?? ''}
                        daily={resource ? dailyRate(resource.salary) : 0}
                        onSave={async (allocationPercent) => {
                          try {
                            await updateAssignment.mutateAsync({
                              id: assignment.id,
                              allocationPercent,
                            });
                            showToast('Alokasi diperbarui.');
                          } catch (mutationError) {
                            showToast(
                              mutationError instanceof Error ? mutationError.message : 'Gagal memperbarui alokasi.',
                              'error',
                            );
                          }
                        }}
                        onDelete={async () => {
                          try {
                            await deleteAssignment.mutateAsync(assignment.id);
                            showToast('Alokasi dihapus.');
                          } catch (mutationError) {
                            showToast(
                              mutationError instanceof Error ? mutationError.message : 'Gagal menghapus alokasi.',
                              'error',
                            );
                          }
                        }}
                      />
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Tambah anggota</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                <Field label="Anggota" htmlFor="assign-resource">
                  <select
                    id="assign-resource"
                    className={inputClass}
                    value={resourceId}
                    onChange={(event) => setResourceId(event.target.value)}
                  >
                    <option value="">— Pilih anggota —</option>
                    {availableResources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} — {resource.role}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Alokasi (%)" htmlFor="assign-percent">
                  <input
                    id="assign-percent"
                    type="number"
                    min={1}
                    max={100}
                    className={inputClass}
                    value={percent}
                    onChange={(event) => setPercent(event.target.value)}
                  />
                </Field>
                <Button onClick={() => void handleAdd()} loading={addAssignment.isPending}>
                  Alokasikan
                </Button>
              </div>
              {availableResources.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Semua anggota sudah dialokasikan pada tugas ini.
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                  {error}
                </p>
              ) : null}
            </section>

            <p className="text-xs text-slate-500">
              Peringatan over-alokasi muncul bila total alokasi seorang anggota melebihi 100% pada hari
              kerja yang sama. Lihat halaman Tim &amp; Biaya untuk ringkasan.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function AssignmentRow({
  assignment,
  resourceName,
  role,
  daily,
  onSave,
  onDelete,
}: {
  assignment: AssignmentRecord;
  resourceName: string;
  role: string;
  daily: number;
  onSave: (allocationPercent: number) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [percent, setPercent] = useState(String(assignment.allocationPercent));
  const [busy, setBusy] = useState(false);
  const value = Number(percent);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{resourceName}</p>
        <p className="text-xs text-slate-500">{role}</p>
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        Alokasi
        <input
          aria-label={`Alokasi ${resourceName}`}
          type="number"
          min={1}
          max={100}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
        />
        %
      </label>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          if (!Number.isInteger(value) || value < 1 || value > 100) return;
          setBusy(true);
          try {
            await onSave(value);
          } finally {
            setBusy(false);
          }
        }}
      >
        Simpan
      </Button>
      <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => void onDelete()}>
        Hapus
      </Button>
      <span className="hidden text-xs text-slate-400 sm:inline">tarif {formatCurrency(daily)}/hari</span>
    </li>
  );
}
