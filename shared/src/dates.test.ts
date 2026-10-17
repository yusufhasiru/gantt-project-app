import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareISODate,
  diffInCalendarDays,
  formatISODate,
  isValidISODate,
  parseISODate,
  todayISODate,
} from './dates.js';

describe('dates', () => {
  it('mengurai tanggal ISO sebagai UTC tanpa pergeseran zona waktu', () => {
    const date = parseISODate('2026-10-23');
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(9);
    expect(date.getUTCDate()).toBe(23);
    expect(formatISODate(date)).toBe('2026-10-23');
  });

  it.each(['2026-02-30', '2026-13-01', '2025-00-10', '23-10-2026', '2026-1-5', ''])(
    'menolak tanggal tidak valid "%s"',
    (value) => {
      expect(isValidISODate(value)).toBe(false);
      expect(() => parseISODate(value)).toThrowError(/Tanggal tidak valid/);
    },
  );

  it('menangani tahun kabisat', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('menangani pergantian bulan dan tahun', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('membandingkan dan menghitung selisih hari kalender', () => {
    expect(compareISODate('2026-10-19', '2026-10-19')).toBe(0);
    expect(compareISODate('2026-10-19', '2026-10-20')).toBe(-1);
    expect(compareISODate('2027-01-01', '2026-12-31')).toBe(1);
    expect(diffInCalendarDays('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('menghasilkan tanggal hari ini dalam format ISO lokal', () => {
    expect(todayISODate(new Date(2026, 9, 17))).toBe('2026-10-17');
    expect(todayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
