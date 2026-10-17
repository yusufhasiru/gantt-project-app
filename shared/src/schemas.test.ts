import { describe, expect, it } from 'vitest';
import {
  projectCreateSchema,
  registerSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from './schemas.js';

describe('schema validasi', () => {
  it('memvalidasi registrasi', () => {
    expect(registerSchema.safeParse({ name: 'Demo', email: 'DEMO@Example.com', password: 'Demo12345' }).success).toBe(true);
    expect(registerSchema.safeParse({ name: 'D', email: 'demo@example.com', password: 'Demo12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ name: 'Demo', email: 'bukan-email', password: 'Demo12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ name: 'Demo', email: 'demo@example.com', password: 'pendek' }).success).toBe(false);
  });

  it('menolak kalender dengan tujuh hari akhir pekan', () => {
    expect(
      projectCreateSchema.safeParse({
        name: 'Proyek',
        startDate: '2026-10-19',
        weekendDays: [0, 1, 2, 3, 4, 5, 6],
      }).success,
    ).toBe(false);
    expect(
      projectCreateSchema.safeParse({
        name: 'Proyek',
        startDate: '2026-10-19',
        weekendDays: [0, 0],
      }).success,
    ).toBe(false);
    expect(
      projectCreateSchema.safeParse({ name: 'Proyek', startDate: '2026-10-19' }).success,
    ).toBe(true);
  });

  it('memvalidasi estimasi PERT pada pembuatan tugas', () => {
    const base = {
      name: 'Tugas',
      durationDays: 10,
      startDate: '2026-10-19',
    };
    expect(taskCreateSchema.safeParse({ ...base, optimisticDays: 8, pessimisticDays: 15 }).success).toBe(true);
    expect(taskCreateSchema.safeParse({ ...base, optimisticDays: 12, pessimisticDays: 15 }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ ...base, optimisticDays: 8 }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ ...base }).success).toBe(true);
  });

  it('menolak warna non-hex dan field tak dikenal pada update', () => {
    expect(
      taskUpdateSchema.safeParse({ color: 'merah' }).success,
    ).toBe(false);
    expect(taskUpdateSchema.safeParse({ scheduledStart: '2026-01-01' }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ progress: 101 }).success).toBe(false);
  });
});
