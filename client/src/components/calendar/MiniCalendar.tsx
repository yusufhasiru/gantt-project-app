import { useMemo } from 'react';
import type { CalendarConfig } from '@gantt/shared';
import { WEEKDAY_SHORT_LABELS } from '@gantt/shared';
import { cn } from '../../lib/format.js';

const MONTH_LABEL = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface MiniCalendarProps {
  month: Date;
  onChangeMonth: (next: Date) => void;
  calendar: CalendarConfig;
  holidayNames?: Map<string, string>;
}

export function MiniCalendar({ month, onChangeMonth, calendar, holidayNames }: MiniCalendarProps) {
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = first.getDay(); // 0 = Minggu
    const start = new Date(first);
    start.setDate(start.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const today = toISO(new Date());
  const todayMonth = new Date().getMonth();

  return (
    <div className="card-base p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Bulan sebelumnya"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          ←
        </button>
        <p className="text-sm font-semibold capitalize text-slate-800">{MONTH_LABEL.format(month)}</p>
        <button
          type="button"
          aria-label="Bulan berikutnya"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-slate-400">
        {WEEKDAY_SHORT_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date) => {
          const iso = toISO(date);
          const isWeekendDay = calendar.weekendDays.includes(date.getDay());
          const isHoliday = calendar.holidays.includes(iso);
          const outside = date.getMonth() !== month.getMonth();
          const isToday = iso === today;
          const holidayName = holidayNames?.get(iso);
          return (
            <div
              key={iso}
              title={holidayName ?? (isWeekendDay ? 'Akhir pekan' : undefined)}
              className={cn(
                'relative flex h-8 items-center justify-center rounded-md text-xs',
                outside ? 'text-slate-300' : 'text-slate-700',
                !outside && isWeekendDay && 'bg-slate-100 text-slate-500',
                !outside && isHoliday && 'bg-amber-100 font-semibold text-amber-800',
                isToday && !outside && 'ring-2 ring-brand-400',
              )}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-slate-200" aria-hidden="true" /> Akhir pekan
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-amber-200" aria-hidden="true" /> Hari libur
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded ring-2 ring-brand-400" aria-hidden="true" /> Hari ini
        </span>
        {month.getMonth() === todayMonth ? null : <span>Menampilkan bulan lain</span>}
      </div>
    </div>
  );
}
