import { addDays, dayOfWeek, diffInCalendarDays, parseISODate } from './dates.js';
import { CalendarError, DomainError } from './errors.js';
import type { CalendarConfig } from './types.js';

/** Batas keamanan agar konfigurasi kalender yang salah tidak membuat loop tak berujung. */
const MAX_SCAN_DAYS = 366 * 50;

export function normalizeCalendar(calendar: CalendarConfig): CalendarConfig {
  const weekendDays = Array.from(new Set(calendar.weekendDays)).sort((a, b) => a - b);
  return { weekendDays, holidays: Array.from(new Set(calendar.holidays)).sort() };
}

export function assertValidCalendar(calendar: CalendarConfig): void {
  if (!Array.isArray(calendar.weekendDays)) {
    throw new CalendarError('weekendDays harus berupa daftar angka 0-6.');
  }
  for (const day of calendar.weekendDays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new CalendarError('Hari akhir pekan harus bilangan bulat 0-6 (0 = Minggu).', { day });
    }
  }
  const unique = new Set(calendar.weekendDays);
  if (unique.size !== calendar.weekendDays.length) {
    throw new CalendarError('Hari akhir pekan tidak boleh duplikat.');
  }
  if (unique.size === 7) {
    throw new CalendarError('Minimal harus ada satu hari kerja dalam seminggu.');
  }
  for (const holiday of calendar.holidays) {
    try {
      parseISODate(holiday);
    } catch {
      throw new CalendarError(`Hari libur tidak valid: "${holiday}".`, { holiday });
    }
  }
}

function assertCalendar(calendar: CalendarConfig): void {
  if (calendar.weekendDays.length === 7) {
    throw new CalendarError('Minimal harus ada satu hari kerja dalam seminggu.');
  }
}

export function isWeekend(value: string, calendar: CalendarConfig): boolean {
  return calendar.weekendDays.includes(dayOfWeek(value));
}

export function isHoliday(value: string, calendar: CalendarConfig): boolean {
  return calendar.holidays.includes(value);
}

export function isWorkingDay(value: string, calendar: CalendarConfig): boolean {
  parseISODate(value);
  assertCalendar(calendar);
  return !isWeekend(value, calendar) && !isHoliday(value, calendar);
}

/** Mengembalikan tanggal itu sendiri bila hari kerja, atau hari kerja berikutnya. */
export function nextWorkingDay(value: string, calendar: CalendarConfig): string {
  parseISODate(value);
  assertCalendar(calendar);
  let cursor = value;
  for (let i = 0; i <= MAX_SCAN_DAYS; i += 1) {
    if (isWorkingDay(cursor, calendar)) return cursor;
    cursor = addDays(cursor, 1);
  }
  throw new CalendarError('Tidak ditemukan hari kerja dalam rentang pencarian.', { from: value });
}

/** Hari kerja terakhir sebelum (atau sama dengan) tanggal yang diberikan. */
export function previousWorkingDay(value: string, calendar: CalendarConfig): string {
  parseISODate(value);
  assertCalendar(calendar);
  let cursor = value;
  for (let i = 0; i <= MAX_SCAN_DAYS; i += 1) {
    if (isWorkingDay(cursor, calendar)) return cursor;
    cursor = addDays(cursor, -1);
  }
  throw new CalendarError('Tidak ditemukan hari kerja dalam rentang pencarian.', { from: value });
}

/**
 * Menggeser tanggal sebanyak n hari kerja.
 * - n = 0 mengembalikan tanggal itu sendiri bila hari kerja, atau hari kerja berikutnya.
 * - n positif bergerak maju, n negatif bergerak mundur.
 * Tanggal awal dianggap sebagai langkah ke-0.
 */
export function shiftWorkingDays(
  value: string,
  amount: number,
  calendar: CalendarConfig,
): string {
  if (!Number.isInteger(amount)) {
    throw new DomainError('INVALID_SHIFT', 'Per geseran hari kerja harus bilangan bulat.');
  }
  if (Math.abs(amount) > MAX_SCAN_DAYS) {
    throw new DomainError('INVALID_SHIFT', 'Per geseran hari kerja terlalu besar.');
  }
  if (amount === 0) return nextWorkingDay(value, calendar);

  const step = amount > 0 ? 1 : -1;
  let remaining = Math.abs(amount);
  let cursor = step > 0 ? nextWorkingDay(value, calendar) : previousWorkingDay(value, calendar);

  while (remaining > 0) {
    cursor = step > 0 ? addDays(cursor, 1) : addDays(cursor, -1);
    if (isWorkingDay(cursor, calendar)) {
      remaining -= 1;
    }
  }
  return cursor;
}

/** Jumlah hari kerja inklusif antara start dan end. Mengembalikan 0 bila start > end. */
export function workingDaysBetween(
  start: string,
  end: string,
  calendar: CalendarConfig,
): number {
  parseISODate(start);
  parseISODate(end);
  assertCalendar(calendar);
  if (start > end) return 0;
  const total = diffInCalendarDays(start, end);
  let count = 0;
  let cursor = start;
  for (let i = 0; i <= total; i += 1) {
    if (isWorkingDay(cursor, calendar)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/** Daftar hari kerja dalam rentang inklusif. */
export function enumerateWorkingDays(
  start: string,
  end: string,
  calendar: CalendarConfig,
): string[] {
  if (start > end) return [];
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    if (isWorkingDay(cursor, calendar)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** Ordinal hari kerja: 0 untuk hari kerja pertama pada/setelah tanggal acuan. */
export function workingDayOrdinal(
  value: string,
  projectStart: string,
  calendar: CalendarConfig,
): number {
  const base = nextWorkingDay(projectStart, calendar);
  const normalized = nextWorkingDay(value, calendar);
  return workingDaysBetween(base, normalized, calendar) - 1;
}
