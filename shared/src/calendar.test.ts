import { describe, expect, it } from 'vitest';
import {
  assertValidCalendar,
  isWorkingDay,
  nextWorkingDay,
  previousWorkingDay,
  shiftWorkingDays,
  workingDayOrdinal,
  workingDaysBetween,
} from './calendar.js';

const weekend = { weekendDays: [0, 6], holidays: [] as string[] };

describe('kalender kerja', () => {
  it('mengenali akhir pekan Sabtu dan Minggu', () => {
    expect(isWorkingDay('2026-10-23', weekend)).toBe(true); // Jumat
    expect(isWorkingDay('2026-10-24', weekend)).toBe(false); // Sabtu
    expect(isWorkingDay('2026-10-25', weekend)).toBe(false); // Minggu
  });

  it('nextWorkingDay mengembalikan tanggal yang sama bila hari kerja', () => {
    expect(nextWorkingDay('2026-10-23', weekend)).toBe('2026-10-23');
    expect(nextWorkingDay('2026-10-24', weekend)).toBe('2026-10-26');
  });

  it('previousWorkingDay melewati akhir pekan', () => {
    expect(previousWorkingDay('2026-10-25', weekend)).toBe('2026-10-23');
    expect(previousWorkingDay('2026-10-23', weekend)).toBe('2026-10-23');
  });

  it('shiftWorkingDays mendukung nol, positif, dan negatif', () => {
    expect(shiftWorkingDays('2026-10-23', 0, weekend)).toBe('2026-10-23');
    expect(shiftWorkingDays('2026-10-23', 2, weekend)).toBe('2026-10-27');
    expect(shiftWorkingDays('2026-10-26', -1, weekend)).toBe('2026-10-23');
    expect(shiftWorkingDays('2026-10-24', 0, weekend)).toBe('2026-10-26');
    expect(shiftWorkingDays('2026-10-23', 10, weekend)).toBe('2026-11-06');
  });

  it('menghitung hari kerja secara inklusif', () => {
    expect(workingDaysBetween('2026-10-23', '2026-10-27', weekend)).toBe(3);
    expect(workingDaysBetween('2026-10-23', '2026-10-23', weekend)).toBe(1);
    expect(workingDaysBetween('2026-10-23', '2026-10-24', weekend)).toBe(1);
    expect(workingDaysBetween('2026-10-27', '2026-10-23', weekend)).toBe(0);
    expect(workingDaysBetween('2026-10-19', '2026-10-30', weekend)).toBe(10);
  });

  it('mengabaikan hari libur khusus', () => {
    const calendar = { weekendDays: [0, 6], holidays: ['2026-10-26'] };
    expect(isWorkingDay('2026-10-26', calendar)).toBe(false);
    expect(shiftWorkingDays('2026-10-23', 2, calendar)).toBe('2026-10-28');
    expect(workingDaysBetween('2026-10-23', '2026-10-28', calendar)).toBe(3);
  });

  it('menangani hari libur berurutan', () => {
    const calendar = { weekendDays: [0, 6], holidays: ['2026-10-26', '2026-10-27'] };
    expect(nextWorkingDay('2026-10-24', calendar)).toBe('2026-10-28');
    expect(shiftWorkingDays('2026-10-23', 1, calendar)).toBe('2026-10-28');
  });

  it('menghitung ordinal hari kerja dari tanggal acuan', () => {
    expect(workingDayOrdinal('2026-10-19', '2026-10-19', weekend)).toBe(0);
    expect(workingDayOrdinal('2026-10-20', '2026-10-19', weekend)).toBe(1);
    expect(workingDayOrdinal('2026-10-26', '2026-10-19', weekend)).toBe(5);
  });

  it('menolak konfigurasi kalender yang tidak valid', () => {
    expect(() => assertValidCalendar({ weekendDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] })).toThrowError(
      /Minimal harus ada satu hari kerja/,
    );
    expect(() => assertValidCalendar({ weekendDays: [0, 0], holidays: [] })).toThrowError(
      /duplikat/,
    );
    expect(() => assertValidCalendar({ weekendDays: [0, 7], holidays: [] })).toThrowError(
      /0-6/,
    );
    expect(() =>
      assertValidCalendar({ weekendDays: [0, 6], holidays: ['2026-02-30'] }),
    ).toThrowError(/Hari libur tidak valid/);
  });

  it('mendukung akhir pekan hanya satu hari', () => {
    const calendar = { weekendDays: [0], holidays: [] };
    expect(nextWorkingDay('2026-10-24', calendar)).toBe('2026-10-24');
    expect(nextWorkingDay('2026-10-25', calendar)).toBe('2026-10-26');
  });
});
