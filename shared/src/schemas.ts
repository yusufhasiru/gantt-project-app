import { z } from 'zod';
import { isValidISODate } from './dates.js';
import { DEPENDENCY_TYPES, TASK_PRIORITIES } from './types.js';

export const isoDateSchema = z
  .string()
  .refine((value) => isValidISODate(value), 'Tanggal harus valid dengan format YYYY-MM-DD.');

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus menggunakan format hex #RRGGBB.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email wajib diisi.')
  .email('Format email tidak valid.')
  .max(160, 'Email terlalu panjang.');

export const passwordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter.')
  .max(72, 'Password maksimal 72 karakter.');

export const userNameSchema = z
  .string()
  .trim()
  .min(2, 'Nama minimal 2 karakter.')
  .max(80, 'Nama maksimal 80 karakter.');

export const weekendDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .max(6, 'Minimal harus ada satu hari kerja.')
  .refine((days) => new Set(days).size === days.length, 'Hari akhir pekan tidak boleh duplikat.')
  .refine((days) => new Set(days).size < 7, 'Minimal harus ada satu hari kerja.');

export const registerSchema = z.object({
  name: userNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password wajib diisi.'),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nama proyek wajib diisi.').max(120, 'Nama proyek terlalu panjang.'),
  description: z.string().trim().max(2000, 'Deskripsi terlalu panjang.').nullable().optional(),
  startDate: isoDateSchema,
  weekendDays: weekendDaysSchema.optional(),
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Nama proyek wajib diisi.').max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  startDate: isoDateSchema.optional(),
});

export const threePointSchema = z
  .object({
    durationDays: z.number().int().min(1, 'Durasi minimal 1 hari kerja.').max(365),
    optimisticDays: z.number().int().min(1).max(365).nullable().optional(),
    pessimisticDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .refine(
    (data) => {
      const { optimisticDays, pessimisticDays, durationDays } = data;
      if (optimisticDays == null && pessimisticDays == null) return true;
      if (optimisticDays == null || pessimisticDays == null) return false;
      return optimisticDays <= durationDays && pessimisticDays >= durationDays;
    },
    {
      message:
        'Estimasi PERT harus lengkap: optimistis ≤ durasi ≤ pesimistis (isi kedua nilai).',
      path: ['optimisticDays'],
    },
  );

const estimateFields = {
  optimisticDays: z.number().int().min(1).max(365).nullable().optional(),
  pessimisticDays: z.number().int().min(1).max(365).nullable().optional(),
};

export const taskCreateSchema = threePointSchema.and(
  z.object({
    name: z.string().trim().min(1, 'Nama tugas wajib diisi.').max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    startDate: isoDateSchema,
    priority: z.enum(TASK_PRIORITIES).optional(),
    color: hexColorSchema.optional(),
    progress: z.number().int().min(0).max(100).optional(),
  }),
);

export const taskUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Nama tugas wajib diisi.').max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationDays: z.number().int().min(1, 'Durasi minimal 1 hari kerja.').max(365).optional(),
    startDate: isoDateSchema.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    color: hexColorSchema.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    ...estimateFields,
  })
  .strict();

export const moveTaskSchema = z.object({
  parentId: z.string().min(1).nullable(),
  position: z.number().int().min(0),
});

export const dependencyCreateSchema = z.object({
  predecessorId: z.string().min(1, 'Tugas pendahulu wajib dipilih.'),
  type: z.enum(DEPENDENCY_TYPES).optional(),
  lagDays: z.number().int().min(-365).max(365).optional(),
});

export const dependencyUpdateSchema = z
  .object({
    type: z.enum(DEPENDENCY_TYPES).optional(),
    lagDays: z.number().int().min(-365).max(365).optional(),
  })
  .refine((data) => data.type !== undefined || data.lagDays !== undefined, {
    message: 'Tidak ada perubahan yang dikirim.',
  });

export const resourceCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama anggota minimal 2 karakter.').max(120),
  email: emailSchema,
  role: z.string().trim().min(1, 'Peran wajib diisi.').max(80),
  salary: z
    .number()
    .int('Gaji harus bilangan bulat rupiah.')
    .min(0, 'Gaji tidak boleh negatif.')
    .max(2_000_000_000, 'Gaji terlalu besar.'),
});

export const resourceUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Nama anggota minimal 2 karakter.').max(120).optional(),
  email: emailSchema.optional(),
  role: z.string().trim().min(1, 'Peran wajib diisi.').max(80).optional(),
  salary: z.number().int().min(0).max(2_000_000_000).optional(),
});

export const assignmentCreateSchema = z.object({
  resourceId: z.string().min(1, 'Anggota wajib dipilih.'),
  allocationPercent: z.number().int().min(1).max(100).optional(),
});

export const assignmentUpdateSchema = z.object({
  allocationPercent: z.number().int().min(1, 'Alokasi minimal 1%.').max(100, 'Alokasi maksimal 100%.'),
});

export const calendarUpdateSchema = z.object({
  weekendDays: weekendDaysSchema,
});

export const holidayCreateSchema = z.object({
  date: isoDateSchema,
  name: z.string().trim().min(1, 'Nama hari libur wajib diisi.').max(120),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type DependencyCreateInput = z.infer<typeof dependencyCreateSchema>;
export type DependencyUpdateInput = z.infer<typeof dependencyUpdateSchema>;
export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;
export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;
export type CalendarUpdateInput = z.infer<typeof calendarUpdateSchema>;
export type HolidayCreateInput = z.infer<typeof holidayCreateSchema>;
