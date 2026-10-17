import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { emailSchema, type ResourceRecord } from '@gantt/shared';
import { useProjectMutations } from '../../hooks/useProjectData.js';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { Field, inputClass } from '../ui/Field.js';
import { useToast } from '../ui/Toast.js';

const resourceFormSchema = z.object({
  name: z.string().trim().min(2, 'Nama anggota minimal 2 karakter.').max(120),
  email: emailSchema,
  role: z.string().trim().min(1, 'Peran wajib diisi.').max(80),
  salary: z
    .string()
    .trim()
    .min(1, 'Gaji bulanan wajib diisi.')
    .regex(/^\d+$/, 'Gaji harus berupa angka bulat rupiah.')
    .transform(Number)
    .refine((value) => value >= 0 && value <= 2_000_000_000, 'Gaji tidak valid.'),
});

type ResourceFormInput = z.input<typeof resourceFormSchema>;
type ResourceFormOutput = z.output<typeof resourceFormSchema>;

interface ResourceFormDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  resource?: ResourceRecord | null;
}

export function ResourceFormDialog({ open, onClose, projectId, resource }: ResourceFormDialogProps) {
  const { createResource, updateResource } = useProjectMutations(projectId);
  const { showToast } = useToast();
  const isEdit = Boolean(resource);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResourceFormInput, unknown, ResourceFormOutput>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: { name: '', email: '', role: '', salary: '0' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: resource?.name ?? '',
      email: resource?.email ?? '',
      role: resource?.role ?? '',
      salary: String(resource?.salary ?? ''),
    });
  }, [open, resource, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (resource) {
        await updateResource.mutateAsync({ id: resource.id, input: values });
        showToast('Data anggota diperbarui.');
      } else {
        await createResource.mutateAsync(values);
        showToast('Anggota tim ditambahkan.');
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan anggota.';
      setError('root', { message });
      showToast(message, 'error');
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit anggota tim' : 'Tambah anggota tim'}
      description="Gaji bulanan dipakai untuk menghitung tarif harian (gaji ÷ 22 hari kerja)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button form="resource-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Simpan perubahan' : 'Tambah anggota'}
          </Button>
        </>
      }
    >
      <form id="resource-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nama lengkap" htmlFor="resource-name" error={errors.name?.message} required>
          <input
            id="resource-name"
            className={inputClass}
            placeholder="Contoh: Andi Pratama"
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="resource-email" error={errors.email?.message} required>
            <input
              id="resource-email"
              type="email"
              className={inputClass}
              placeholder="andi@example.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </Field>
          <Field label="Peran" htmlFor="resource-role" error={errors.role?.message} required>
            <input
              id="resource-role"
              className={inputClass}
              placeholder="Contoh: Backend Developer"
              aria-invalid={Boolean(errors.role)}
              {...register('role')}
            />
          </Field>
        </div>
        <Field
          label="Gaji bulanan (Rp)"
          htmlFor="resource-salary"
          error={errors.salary?.message}
          hint="Tarif harian = gaji bulanan ÷ 22."
          required
        >
          <input
            id="resource-salary"
            type="number"
            min={0}
            step={100000}
            className={inputClass}
            placeholder="12000000"
            aria-invalid={Boolean(errors.salary)}
            {...register('salary')}
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
