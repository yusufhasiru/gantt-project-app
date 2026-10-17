import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isoDateSchema, todayISODate } from '@gantt/shared';
import type { ProjectSummary } from '../../api/types.js';
import type { ProjectSnapshot } from '@gantt/shared';
import { useProjectActions } from '../../hooks/useProjectData.js';
import { useToast } from '../ui/Toast.js';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { Field, inputClass } from '../ui/Field.js';

const projectFormSchema = z.object({
  name: z.string().trim().min(1, 'Nama proyek wajib diisi.').max(120, 'Nama proyek terlalu panjang.'),
  description: z.string().trim().max(2000, 'Deskripsi terlalu panjang.').optional(),
  startDate: isoDateSchema,
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  project?: ProjectSummary | null;
  onCreated?: (snapshot: ProjectSnapshot) => void;
}

export function ProjectFormDialog({ open, onClose, project, onCreated }: ProjectFormDialogProps) {
  const { createProject, updateProject } = useProjectActions();
  const { showToast } = useToast();
  const isEdit = Boolean(project);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: '', description: '', startDate: todayISODate() },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: project?.name ?? '',
      description: project?.description ?? '',
      startDate: project?.startDate ?? todayISODate(),
    });
  }, [open, project, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (project) {
        await updateProject.mutateAsync({
          id: project.id,
          input: {
            name: values.name,
            description: values.description?.trim() || null,
            startDate: values.startDate,
          },
        });
        showToast('Proyek berhasil diperbarui.');
      } else {
        const snapshot = await createProject.mutateAsync({
          name: values.name,
          description: values.description?.trim() || null,
          startDate: values.startDate,
          weekendDays: [0, 6],
        });
        showToast('Proyek berhasil dibuat.');
        onCreated?.(snapshot);
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan proyek.';
      setError('root', { message });
      showToast(message, 'error');
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit proyek' : 'Proyek baru'}
      description={
        isEdit
          ? 'Ubah nama, deskripsi, atau tanggal mulai proyek. Perubahan tanggal memicu penjadwalan ulang.'
          : 'Tentukan nama dan tanggal mulai. Hari kerja dapat diatur kemudian di halaman Kalender.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button form="project-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Simpan perubahan' : 'Buat proyek'}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nama proyek" htmlFor="project-name" error={errors.name?.message} required>
          <input
            id="project-name"
            className={inputClass}
            placeholder="Contoh: Pengembangan Aplikasi Mobile"
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
        </Field>
        <Field label="Deskripsi" htmlFor="project-description" error={errors.description?.message}>
          <textarea
            id="project-description"
            rows={3}
            className={inputClass}
            placeholder="Ringkasan tujuan dan cakupan proyek (opsional)"
            {...register('description')}
          />
        </Field>
        <Field
          label="Tanggal mulai"
          htmlFor="project-start"
          error={errors.startDate?.message}
          hint="Tanggal paling awal yang menjadi acuan penjadwalan."
          required
        >
          <input
            id="project-start"
            type="date"
            className={inputClass}
            aria-invalid={Boolean(errors.startDate)}
            {...register('startDate')}
          />
        </Field>
        {errors.root?.message ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errors.root.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
