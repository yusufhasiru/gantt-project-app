import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  TASK_PRIORITIES,
  flattenTasks,
  getDescendantIds,
  getTaskDepth,
  hexColorSchema,
  isoDateSchema,
  type TaskRecord,
} from '@gantt/shared';
import { useProjectMutations } from '../../hooks/useProjectData.js';
import { useToast } from '../ui/Toast.js';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { Field, inputClass } from '../ui/Field.js';

const numericText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} wajib diisi.`)
    .regex(/^\d+$/, `${label} harus berupa angka bulat.`)
    .transform(Number)
    .refine((value) => value >= min && value <= max, `${label} harus antara ${min} dan ${max}.`);

const optionalNumericText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : Number(value)))
    .refine(
      (value) => value === undefined || (Number.isInteger(value) && value >= min && value <= max),
      `${label} harus bilangan bulat ${min}-${max}.`,
    );

const taskFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Nama tugas wajib diisi.').max(160, 'Nama tugas terlalu panjang.'),
    description: z.string().trim().max(2000, 'Deskripsi terlalu panjang.').optional(),
    parentId: z.string().optional(),
    durationDays: numericText('Durasi', 1, 365),
    startDate: isoDateSchema,
    priority: z.enum(TASK_PRIORITIES),
    color: hexColorSchema,
    progress: numericText('Progres', 0, 100),
    optimisticDays: optionalNumericText('Estimasi optimistis', 1, 365),
    pessimisticDays: optionalNumericText('Estimasi pesimistis', 1, 365),
  })
  .refine(
    (data) => {
      if (data.optimisticDays === undefined && data.pessimisticDays === undefined) return true;
      if (data.optimisticDays === undefined || data.pessimisticDays === undefined) return false;
      return data.optimisticDays <= data.durationDays && data.pessimisticDays >= data.durationDays;
    },
    {
      message: 'Isi kedua estimasi: optimistis ≤ durasi ≤ pesimistis.',
      path: ['optimisticDays'],
    },
  );

type TaskFormInput = z.input<typeof taskFormSchema>;
type TaskFormOutput = z.output<typeof taskFormSchema>;

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectStart: string;
  tasks: TaskRecord[];
  task?: TaskRecord | null;
  defaultParentId?: string | null;
}

export function TaskFormDialog({
  open,
  onClose,
  projectId,
  projectStart,
  tasks,
  task,
  defaultParentId,
}: TaskFormDialogProps) {
  const { createTask, updateTask, moveTask } = useProjectMutations(projectId);
  const { showToast } = useToast();
  const isEdit = Boolean(task);
  const isSummary = Boolean(task && tasks.some((item) => item.parentId === task.id));

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormInput, unknown, TaskFormOutput>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: '',
      description: '',
      parentId: '',
      durationDays: '3',
      startDate: projectStart,
      priority: 'MEDIUM',
      color: '#6366f1',
      progress: '0',
      optimisticDays: '',
      pessimisticDays: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: task?.name ?? '',
      description: task?.description ?? '',
      parentId: task?.parentId ?? defaultParentId ?? '',
      durationDays: String(task?.durationDays ?? 3),
      startDate: task?.startDate ?? projectStart,
      priority: task?.priority ?? 'MEDIUM',
      color: task?.color ?? '#6366f1',
      progress: String(task?.progress ?? 0),
      optimisticDays: task?.optimisticDays != null ? String(task.optimisticDays) : '',
      pessimisticDays: task?.pessimisticDays != null ? String(task.pessimisticDays) : '',
    });
  }, [open, task, defaultParentId, projectStart, reset]);

  const parentOptions = useMemo(() => {
    const flat = flattenTasks(tasks);
    const forbidden = new Set<string>();
    if (task) {
      forbidden.add(task.id);
      for (const id of getDescendantIds(tasks, task.id)) forbidden.add(id);
    }
    const subtreeHeight = task
      ? Math.max(
          0,
          ...getDescendantIds(tasks, task.id).map(
            (id) => getTaskDepth(tasks, id) - getTaskDepth(tasks, task.id),
          ),
        )
      : 0;

    return flat.filter(({ task: candidate }) => {
      if (forbidden.has(candidate.id)) return false;
      const candidateDepth = getTaskDepth(tasks, candidate.id);
      return candidateDepth + subtreeHeight + 1 <= 3;
    });
  }, [tasks, task]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (task && isSummary) {
        await updateTask.mutateAsync({
          id: task.id,
          input: {
            name: values.name,
            description: values.description?.trim() || null,
            color: values.color,
            priority: values.priority,
          },
        });
        showToast('Tugas induk berhasil diperbarui.');
        onClose();
        return;
      }

      const payload = {
        name: values.name,
        description: values.description?.trim() || null,
        durationDays: values.durationDays,
        startDate: values.startDate,
        priority: values.priority,
        color: values.color,
        progress: values.progress,
        optimisticDays: values.optimisticDays ?? null,
        pessimisticDays: values.pessimisticDays ?? null,
      };

      if (task) {
        await updateTask.mutateAsync({ id: task.id, input: payload });
        const nextParent = values.parentId || null;
        if (nextParent !== task.parentId) {
          await moveTask.mutateAsync({
            id: task.id,
            input: { parentId: nextParent, position: Number.MAX_SAFE_INTEGER },
          });
        }
        showToast('Tugas berhasil diperbarui.');
      } else {
        await createTask.mutateAsync({
          ...payload,
          parentId: values.parentId || null,
        });
        showToast('Tugas berhasil ditambahkan.');
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan tugas.';
      setError('root', { message });
      showToast(message, 'error');
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit tugas' : 'Tugas baru'}
      description={
        isSummary
          ? 'Tugas ini adalah tugas induk. Tanggal, durasi, dan progres dihitung otomatis dari sub-tugas.'
          : 'Tanggal mulai adalah batas paling awal; dependensi dapat menggeser jadwal.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button form="task-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Simpan perubahan' : 'Tambah tugas'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nama tugas" htmlFor="task-name" error={errors.name?.message} required>
          <input
            id="task-name"
            className={inputClass}
            placeholder="Contoh: Implementasi backend"
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
        </Field>

        <Field label="Deskripsi" htmlFor="task-description" error={errors.description?.message}>
          <textarea
            id="task-description"
            rows={2}
            className={inputClass}
            placeholder="Detail pekerjaan (opsional)"
            {...register('description')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tugas induk" htmlFor="task-parent" error={errors.parentId?.message}>
            <select id="task-parent" className={inputClass} {...register('parentId')}>
              <option value="">— Tanpa induk (level 1) —</option>
              {parentOptions.map(({ task: candidate, wbs, depth }) => (
                <option key={candidate.id} value={candidate.id}>
                  {'\u00A0'.repeat(depth * 3)}
                  {wbs} {candidate.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Durasi (hari kerja)"
            htmlFor="task-duration"
            error={errors.durationDays?.message}
            required
          >
            <input
              id="task-duration"
              type="number"
              min={1}
              max={365}
              disabled={isSummary}
              className={inputClass}
              aria-invalid={Boolean(errors.durationDays)}
              {...register('durationDays')}
            />
          </Field>

          <Field label="Tanggal mulai paling awal" htmlFor="task-start" error={errors.startDate?.message} required>
            <input
              id="task-start"
              type="date"
              disabled={isSummary}
              className={inputClass}
              aria-invalid={Boolean(errors.startDate)}
              {...register('startDate')}
            />
          </Field>

          <Field label="Prioritas" htmlFor="task-priority" error={errors.priority?.message}>
            <select id="task-priority" className={inputClass} {...register('priority')}>
              <option value="LOW">Rendah</option>
              <option value="MEDIUM">Sedang</option>
              <option value="HIGH">Tinggi</option>
            </select>
          </Field>

          <Field label="Warna" htmlFor="task-color" error={errors.color?.message}>
            <div className="flex items-center gap-2">
              <input
                id="task-color"
                type="color"
                className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                {...register('color')}
              />
              <input className={inputClass} aria-label="Kode warna hex" {...register('color')} />
            </div>
          </Field>

          <Field label="Progres (%)" htmlFor="task-progress" error={errors.progress?.message}>
            <input
              id="task-progress"
              type="number"
              min={0}
              max={100}
              disabled={isSummary}
              className={inputClass}
              aria-invalid={Boolean(errors.progress)}
              {...register('progress')}
            />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3" disabled={isSummary}>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Estimasi PERT (opsional)
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Optimistis (hari)" htmlFor="task-optimistic" error={errors.optimisticDays?.message}>
              <input
                id="task-optimistic"
                type="number"
                min={1}
                max={365}
                className={inputClass}
                {...register('optimisticDays')}
              />
            </Field>
            <Field label="Pesimistis (hari)" htmlFor="task-pessimistic" error={errors.pessimisticDays?.message}>
              <input
                id="task-pessimistic"
                type="number"
                min={1}
                max={365}
                className={inputClass}
                {...register('pessimisticDays')}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Isi keduanya agar analisis PERT tersedia untuk tugas ini.
          </p>
        </fieldset>

        {errors.root?.message ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errors.root.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
