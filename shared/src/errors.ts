/**
 * Kesalahan domain murni (tanpa HTTP). Lapisan API memetakan `code` ke status HTTP.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export class InvalidDateError extends DomainError {
  constructor(value: string) {
    super('INVALID_DATE', `Tanggal tidak valid: "${value}". Format yang diharapkan YYYY-MM-DD.`);
  }
}

export class CalendarError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVALID_CALENDAR', message, details);
  }
}
