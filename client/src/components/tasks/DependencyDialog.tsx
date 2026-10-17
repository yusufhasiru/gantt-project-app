import { useMemo, useState } from 'react';
import {
  DEPENDENCY_LABELS,
  getLeafIds,
  wouldCreateCycle,
  type DependencyRecord,
  type TaskRecord,
} from '@gantt/shared';
import { useProjectMutations } from '../../hooks/useProjectData.js';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { Field, inputClass } from '../ui/Field.js';
import { Badge, EmptyState } from '../ui/States.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { useToast } from '../ui/Toast.js';

interface DependencyDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  task: TaskRecord;
  tasks: TaskRecord[];
  dependencies: DependencyRecord[];
}

export function DependencyDialog({
  open,
  onClose,
  projectId,
  task,
  tasks,
  dependencies,
}: DependencyDialogProps) {
  const { addDependency, updateDependency, deleteDependency } = useProjectMutations(projectId);
  const { showToast } = useToast();
  const [predecessorId, setPredecessorId] = useState('');
  const [type, setType] = useState<'FS' | 'SS'>('FS');
  const [lag, setLag] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DependencyRecord | null>(null);

  const leafIds = useMemo(() => new Set(getLeafIds(tasks)), [tasks]);
  const existing = dependencies.filter((dependency) => dependency.successorId === task.id);
  const existingPredecessors = new Set(existing.map((dependency) => dependency.predecessorId));

  const options = tasks.filter(
    (candidate) =>
      candidate.id !== task.id &&
      leafIds.has(candidate.id) &&
      !existingPredecessors.has(candidate.id) &&
      !wouldCreateCycle(dependencies, candidate.id, task.id),
  );

  const handleAdd = async () => {
    setError(null);
    if (!predecessorId) {
      setError('Pilih tugas pendahulu terlebih dahulu.');
      return;
    }
    const lagDays = Number(lag);
    if (!Number.isInteger(lagDays) || lagDays < -365 || lagDays > 365) {
      setError('Lag harus bilangan bulat antara -365 dan 365.');
      return;
    }
    try {
      await addDependency.mutateAsync({
        id: task.id,
        input: { predecessorId, type, lagDays },
      });
      showToast('Dependensi ditambahkan dan jadwal diperbarui.');
      setPredecessorId('');
      setLag('0');
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Gagal menambah dependensi.');
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Dependensi — ${task.name}`}
        description="Atur tugas pendahulu. Lag dihitung dalam hari kerja dan boleh negatif."
        size="lg"
      >
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Pendahulu saat ini</h3>
            {existing.length === 0 ? (
              <EmptyState
                title="Belum ada dependensi"
                description="Tugas ini belum memiliki pendahulu sehingga mulai pada tanggal paling awalnya."
              />
            ) : (
              <ul className="space-y-2">
                {existing.map((dependency) => {
                  const predecessor = tasks.find((item) => item.id === dependency.predecessorId);
                  return (
                    <DependencyRow
                      key={dependency.id}
                      dependency={dependency}
                      predecessorName={predecessor?.name ?? 'Tugas tidak dikenal'}
                      onSave={async (nextType, nextLag) => {
                        try {
                          await updateDependency.mutateAsync({
                            id: dependency.id,
                            input: { type: nextType, lagDays: nextLag },
                          });
                          showToast('Dependensi diperbarui.');
                        } catch (mutationError) {
                          showToast(
                            mutationError instanceof Error ? mutationError.message : 'Gagal memperbarui dependensi.',
                            'error',
                          );
                        }
                      }}
                      onDelete={() => setDeleting(dependency)}
                    />
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Tambah pendahulu</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_150px_110px_auto] sm:items-end">
              <Field label="Tugas pendahulu" htmlFor="dep-predecessor">
                <select
                  id="dep-predecessor"
                  className={inputClass}
                  value={predecessorId}
                  onChange={(event) => setPredecessorId(event.target.value)}
                >
                  <option value="">— Pilih tugas —</option>
                  {options.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipe" htmlFor="dep-type">
                <select
                  id="dep-type"
                  className={inputClass}
                  value={type}
                  onChange={(event) => setType(event.target.value as 'FS' | 'SS')}
                >
                  <option value="FS">FS — Selesai ke Mulai</option>
                  <option value="SS">SS — Mulai ke Mulai</option>
                </select>
              </Field>
              <Field label="Lag (hari)" htmlFor="dep-lag">
                <input
                  id="dep-lag"
                  type="number"
                  min={-365}
                  max={365}
                  className={inputClass}
                  value={lag}
                  onChange={(event) => setLag(event.target.value)}
                />
              </Field>
              <Button onClick={() => void handleAdd()} loading={addDependency.isPending}>
                Tambah
              </Button>
            </div>
            {options.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Tidak ada kandidat pendahulu yang valid. Dependensi hanya dapat dibuat antar tugas daun.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                {error}
              </p>
            ) : null}
          </section>

          <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-900">
            <p className="font-semibold">Cara perhitungan</p>
            <p className="mt-1">
              FS: penerus mulai setelah pendahulu selesai ditambah lag. SS: penerus mulai bersamaan
              dengan pendahulu ditambah lag. Siklus dependensi ditolak oleh server.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus dependensi?"
        message="Jadwal tugas penerus akan dihitung ulang setelah dependensi dihapus."
        confirmLabel="Hapus dependensi"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteDependency.mutateAsync(deleting.id);
            showToast('Dependensi dihapus.');
            setDeleting(null);
          } catch (mutationError) {
            showToast(
              mutationError instanceof Error ? mutationError.message : 'Gagal menghapus dependensi.',
              'error',
            );
          }
        }}
      />
    </>
  );
}

function DependencyRow({
  dependency,
  predecessorName,
  onSave,
  onDelete,
}: {
  dependency: DependencyRecord;
  predecessorName: string;
  onSave: (type: 'FS' | 'SS', lagDays: number) => Promise<void>;
  onDelete: () => void;
}) {
  const [type, setType] = useState<'FS' | 'SS'>(dependency.type);
  const [lag, setLag] = useState(String(dependency.lagDays));
  const [saving, setSaving] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{predecessorName}</p>
        <p className="mt-0.5 text-xs text-slate-500">{DEPENDENCY_LABELS[type]}</p>
      </div>
      <select
        aria-label={`Tipe dependensi dari ${predecessorName}`}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        value={type}
        onChange={(event) => setType(event.target.value as 'FS' | 'SS')}
      >
        <option value="FS">FS</option>
        <option value="SS">SS</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        Lag
        <input
          aria-label={`Lag dependensi dari ${predecessorName}`}
          type="number"
          min={-365}
          max={365}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
          value={lag}
          onChange={(event) => setLag(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="secondary"
        loading={saving}
        onClick={async () => {
          const value = Number(lag);
          if (!Number.isInteger(value) || value < -365 || value > 365) return;
          setSaving(true);
          try {
            await onSave(type, value);
          } finally {
            setSaving(false);
          }
        }}
      >
        Simpan
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} className="text-rose-500">
        Hapus
      </Button>
      {dependency.lagDays !== 0 ? <Badge tone="info">Lag {dependency.lagDays}</Badge> : null}
    </li>
  );
}
