import { InvalidDateError } from './errors.js';

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Mengubah string ISO menjadi Date UTC pukul 00:00. Melempar InvalidDateError jika tidak valid. */
export function parseISODate(value: string): Date {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new InvalidDateError(String(value));
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new InvalidDateError(value);
  }
  return date;
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  try {
    parseISODate(value);
    return true;
  } catch {
    return false;
  }
}

/** Memformat Date (dibaca dalam UTC) menjadi YYYY-MM-DD. */
export function formatISODate(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Menambah n hari kalender. */
export function addDays(value: string, amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new InvalidDateError(`Jumlah hari harus bilangan bulat: ${amount}`);
  }
  const date = parseISODate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatISODate(date);
}

export function compareISODate(a: string, b: string): number {
  parseISODate(a);
  parseISODate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISODate(values: readonly string[]): string {
  if (values.length === 0) throw new InvalidDateError('(kosong)');
  return values.reduce((min, value) => (value < min ? value : min));
}

export function maxISODate(values: readonly string[]): string {
  if (values.length === 0) throw new InvalidDateError('(kosong)');
  return values.reduce((max, value) => (value > max ? value : max));
}

/** 0 = Minggu ... 6 = Sabtu, dihitung pada UTC. */
export function dayOfWeek(value: string): number {
  return parseISODate(value).getUTCDay();
}

/** Selisih hari kalender b - a. */
export function diffInCalendarDays(a: string, b: string): number {
  const start = parseISODate(a);
  const end = parseISODate(b);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/** Tanggal hari ini dalam zona waktu lokal pengguna, sebagai YYYY-MM-DD. */
export function todayISODate(now: Date = new Date()): string {
  const year = now.getFullYear().toString().padStart(4, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateID(value: string): string {
  const date = parseISODate(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatLongDateID(value: string): string {
  const date = parseISODate(value);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
