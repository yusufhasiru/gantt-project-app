import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  WEEKDAY_LABELS,
  formatDateID,
  formatLongDateID,
  type HolidayRecord,
} from '@gantt/shared';
import { useProject, useProjectMutations } from '../hooks/useProjectData.js';
import { Button } from '../components/ui/Button.js';
import { Field, inputClass } from '../components/ui/Field.js';
import { Badge, ErrorState, PageLoader, StatCard } from '../components/ui/States.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { MiniCalendar } from '../components/calendar/MiniCalendar.js';
import { useToast } from '../components/ui/Toast.js';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function CalendarPage() {
  const { id = '' } = useParams();
  const query = useProject(id);
  const { updateCalendar, addHoliday, removeHoliday } = useProjectMutations(id);
  const { showToast } = useToast();
  const [weekendDays, setWeekendDays] = useState<number[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState<HolidayRecord | null>(null);

  const weekendKey = query.data?.project.weekendDays.join(',') ?? '';
  // Sinkronkan hanya ketika kalender tersimpan berubah, bukan pada setiap refetch,
  // agar perubahan yang belum disimpan tidak hilang.
  useEffect(() => {
    if (query.data) setWeekendDays(query.data.project.weekendDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekendKey]);

  const derived = useMemo(() => {
    if (!query.data) return null;
    const { project, metrics } = query.data;
    const holidayNames = new Map(project.holidays.map((holiday) => [holiday.date, holiday.name]));
    const sorted = [...weekendDays].sort((a, b) => a - b);
    const original = [...project.weekendDays].sort((a, b) => a - b);
    return {
      holidayNames,
      dirty: sorted.join(',') !== original.join(','),
      invalid: sorted.length >= 7 || sorted.length === 0,
      calendar: { weekendDays, holidays: project.holidays.map((holiday) => holiday.date) },
      metrics,
      holidays: project.holidays,
    };
  }, [query.data, weekendDays]);

  if (query.isLoading) return <PageLoader label="Memuat kalender..." />;
  if (query.isError || !query.data || !derived) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat kalender.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { project } = query.data;
  const { holidayNames, dirty, invalid, calendar, metrics, holidays } = derived;

  const toggleDay = (day: number) => {
    setWeekendDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  };

  const saveWeekend = async () => {
    if (invalid) {
      showToast('Minimal harus ada satu hari kerja dalam seminggu.', 'error');
      return;
    }
    try {
      await updateCalendar.mutateAsync([...weekendDays].sort((a, b) => a - b));
      showToast('Jadwal diperbarui');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Gagal menyimpan kalender.', 'error');
    }
  };

  const submitHoliday = async () => {
    setFormError(null);
    if (!holidayDate) {
      setFormError('Tanggal hari libur wajib diisi.');
      return;
    }
    if (!holidayName.trim()) {
      setFormError('Nama hari libur wajib diisi.');
      return;
    }
    try {
      await addHoliday.mutateAsync({ date: holidayDate, name: holidayName.trim() });
      showToast('Jadwal diperbarui');
      setHolidayDate('');
      setHolidayName('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Gagal menambah hari libur.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Akhir pekan"
          value={weekendDays.length > 0 ? weekendDays.map((day) => WEEKDAY_LABELS[day]).join(', ') : '—'}
          hint="Hari yang tidak dihitung sebagai hari kerja"
        />
        <StatCard label="Hari libur" value={holidays.length} hint="Tanggal khusus di dalam proyek" />
        <StatCard
          label="Dampak jadwal"
          value={metrics.endDate ? formatDateID(metrics.endDate) : '—'}
          hint={`${metrics.totalWorkingDays} hari kerja dari awal hingga akhir`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <section className="card-base p-5">
            <h2 className="text-base font-semibold text-slate-900">Hari kerja mingguan</h2>
            <p className="mt-1 text-sm text-slate-500">
              Pilih hari yang dianggap akhir pekan. Durasi tugas hanya menghitung hari kerja, dan
              perubahan di sini akan menjadwalkan ulang seluruh proyek.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DAY_ORDER.map((day) => {
                const checked = weekendDays.includes(day);
                return (
                  <label
                    key={day}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? 'border-brand-300 bg-brand-50 text-brand-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={checked}
                      onChange={() => toggleDay(day)}
                    />
                    {WEEKDAY_LABELS[day]}
                  </label>
                );
              })}
            </div>
            {invalid ? (
              <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Minimal harus ada satu hari kerja dalam seminggu.
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {dirty ? 'Ada perubahan yang belum disimpan.' : 'Kalender tersimpan.'}
              </p>
              <Button onClick={() => void saveWeekend()} disabled={!dirty || invalid} loading={updateCalendar.isPending}>
                Simpan kalender
              </Button>
            </div>
          </section>

          <section className="card-base p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Hari libur khusus</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Hari libur tidak dihitung dalam durasi tugas dan memicu penjadwalan ulang.
                </p>
              </div>
              <Badge tone="brand">{holidays.length} tanggal</Badge>
            </div>

            {holidays.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                Belum ada hari libur pada proyek ini.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {holidays.map((holiday) => (
                  <li key={holiday.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="4" y="5" width="16" height="15" rx="2" />
                          <path d="M4 10h16M8 3v4M16 3v4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{holiday.name}</p>
                        <p className="text-xs text-slate-500">{formatLongDateID(holiday.date)}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => setDeletingHoliday(holiday)}>
                      Hapus
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Tambah hari libur</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr_auto] sm:items-end">
                <Field label="Tanggal" htmlFor="holiday-date">
                  <input
                    id="holiday-date"
                    type="date"
                    className={inputClass}
                    value={holidayDate}
                    onChange={(event) => setHolidayDate(event.target.value)}
                  />
                </Field>
                <Field label="Nama" htmlFor="holiday-name">
                  <input
                    id="holiday-name"
                    className={inputClass}
                    placeholder="Contoh: Hari Raya Natal"
                    value={holidayName}
                    onChange={(event) => setHolidayName(event.target.value)}
                  />
                </Field>
                <Button onClick={() => void submitHoliday()} loading={addHoliday.isPending}>
                  Tambah
                </Button>
              </div>
              {formError ? (
                <p role="alert" className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                  {formError}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-3">
          <MiniCalendar month={month} onChangeMonth={setMonth} calendar={calendar} holidayNames={holidayNames} />
          <section className="card-base p-5 text-sm text-slate-600">
            <h2 className="text-base font-semibold text-slate-900">Ringkasan</h2>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Mulai proyek</dt>
                <dd className="font-medium text-slate-800">{formatDateID(project.startDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Selesai proyek</dt>
                <dd className="font-medium text-slate-800">
                  {metrics.endDate ? formatDateID(metrics.endDate) : 'Belum ada tugas'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Total hari kerja</dt>
                <dd className="font-medium text-slate-800">{metrics.totalWorkingDays} hari</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Hari libur dalam rentang</dt>
                <dd className="font-medium text-slate-800">
                  {holidays.filter((holiday) => !metrics.startDate || !metrics.endDate || (holiday.date >= metrics.startDate && holiday.date <= metrics.endDate)).length}
                </dd>
              </div>
            </dl>
            <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900">
              Contoh: mulai Jumat 23 Oktober 2026 selama 3 hari kerja berakhir Selasa 27 Oktober. Dengan
              libur Senin 26 Oktober, selesai bergeser ke Rabu 28 Oktober.
            </p>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deletingHoliday)}
        title="Hapus hari libur?"
        message={`Hari libur "${deletingHoliday?.name ?? ''}" akan dihapus dan jadwal proyek dihitung ulang.`}
        confirmLabel="Hapus hari libur"
        onCancel={() => setDeletingHoliday(null)}
        onConfirm={async () => {
          if (!deletingHoliday) return;
          try {
            await removeHoliday.mutateAsync(deletingHoliday.id);
            showToast('Jadwal diperbarui');
            setDeletingHoliday(null);
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Gagal menghapus hari libur.', 'error');
          }
        }}
      />
    </div>
  );
}
