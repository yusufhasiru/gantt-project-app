import { describe, expect, it } from 'vitest';
import { scheduleProject, validateDependencies, wouldCreateCycle } from './scheduler.js';
import type { CalendarConfig, DependencyInput, ScheduleTaskInput } from './types.js';

const weekend: CalendarConfig = { weekendDays: [0, 6], holidays: [] };
const holidayCalendar: CalendarConfig = { weekendDays: [0, 6], holidays: ['2026-10-26'] };

function task(partial: Partial<ScheduleTaskInput> & { id: string }): ScheduleTaskInput {
  return {
    parentId: null,
    position: 0,
    durationDays: 1,
    startDate: '2026-10-19',
    progress: 0,
    ...partial,
  };
}

function dependency(
  partial: Partial<DependencyInput> & { predecessorId: string; successorId: string },
): DependencyInput {
  return { id: `${partial.predecessorId}-${partial.successorId}`, type: 'FS', lagDays: 0, ...partial };
}

describe('mesin penjadwalan — vektor wajib', () => {
  it('vektor 1: mulai Jumat 23 Oktober 2026, durasi 3 hari kerja, selesai Selasa 27 Oktober', () => {
    const result = scheduleProject({
      tasks: [task({ id: 'a', startDate: '2026-10-23', durationDays: 3 })],
      dependencies: [],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    expect(result.byId.a?.scheduledStart).toBe('2026-10-23');
    expect(result.byId.a?.scheduledEnd).toBe('2026-10-27');
  });

  it('vektor 2: FS lag 0 memulai penerus Rabu 28 Oktober', () => {
    const result = scheduleProject({
      tasks: [
        task({ id: 'a', startDate: '2026-10-23', durationDays: 3 }),
        task({ id: 'b', startDate: '2026-10-19', durationDays: 2, position: 1 }),
      ],
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS', lagDays: 0, id: 'd1' }],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    expect(result.byId.b?.scheduledStart).toBe('2026-10-28');
    expect(result.byId.b?.scheduledEnd).toBe('2026-10-29');
  });

  it('vektor 3: SS lag 2 memulai penerus Selasa 27 Oktober', () => {
    const result = scheduleProject({
      tasks: [
        task({ id: 'a', startDate: '2026-10-23', durationDays: 3 }),
        task({ id: 'b', startDate: '2026-10-19', durationDays: 2, position: 1 }),
      ],
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'SS', lagDays: 2, id: 'd1' }],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    expect(result.byId.b?.scheduledStart).toBe('2026-10-27');
  });

  it('vektor 4: hari libur Senin 26 Oktober menggeser selesai ke Rabu 28 Oktober', () => {
    const result = scheduleProject({
      tasks: [task({ id: 'a', startDate: '2026-10-23', durationDays: 3 })],
      dependencies: [],
      calendar: holidayCalendar,
      projectStart: '2026-10-19',
    });
    expect(result.byId.a?.scheduledEnd).toBe('2026-10-28');
  });
});

describe('mesin penjadwalan — batas dan validasi', () => {
  it('durasi 1 hari tidak melewati batas akhir pekan', () => {
    const result = scheduleProject({
      tasks: [task({ id: 'a', startDate: '2026-10-25', durationDays: 1 })],
      dependencies: [],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    expect(result.byId.a?.scheduledStart).toBe('2026-10-26');
    expect(result.byId.a?.scheduledEnd).toBe('2026-10-26');
  });

  it('memaksa tanggal mulai pada hari kerja', () => {
    const result = scheduleProject({
      tasks: [task({ id: 'a', startDate: '2026-10-24', durationDays: 2 })],
      dependencies: [],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    expect(result.byId.a?.scheduledStart).toBe('2026-10-26');
    expect(result.byId.a?.scheduledEnd).toBe('2026-10-27');
  });

  it('menghormati startDate sebagai batas paling awal saat lag negatif', () => {
    const result = scheduleProject({
      tasks: [
        task({ id: 'a', startDate: '2026-10-19', durationDays: 3 }),
        task({ id: 'b', startDate: '2026-10-26', durationDays: 1, position: 1 }),
      ],
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS', lagDays: -1, id: 'd1' }],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    // FS lag -1: penerus boleh mulai pada hari berakhirnya pendahulu (21 Okt),
    // tetapi startDate penerus adalah 26 Okt sehingga batas tersebut menang.
    expect(result.byId.b?.scheduledStart).toBe('2026-10-26');
  });

  it('lag negatif dapat memajukan penerus sebelum tanggal mulai default', () => {
    const result = scheduleProject({
      tasks: [
        task({ id: 'a', startDate: '2026-10-19', durationDays: 5 }),
        task({ id: 'b', startDate: '2026-10-19', durationDays: 2, position: 1 }),
      ],
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS', lagDays: -2, id: 'd1' }],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    expect(result.byId.a?.scheduledEnd).toBe('2026-10-23');
    expect(result.byId.b?.scheduledStart).toBe('2026-10-22');
    expect(result.byId.b?.scheduledEnd).toBe('2026-10-23');
  });

  it('menolak dependensi ke diri sendiri, duplikat, dan siklus', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b', position: 1 })];
    expect(() =>
      validateDependencies(tasks, [
        { id: 'd1', predecessorId: 'a', successorId: 'a', type: 'FS', lagDays: 0 },
      ]),
    ).toThrowError(/dirinya sendiri/);

    expect(() =>
      validateDependencies(tasks, [
        { id: 'd1', predecessorId: 'a', successorId: 'b', type: 'FS', lagDays: 0 },
        { id: 'd2', predecessorId: 'a', successorId: 'b', type: 'SS', lagDays: 1 },
      ]),
    ).toThrowError(/sudah ada/);

    expect(() =>
      validateDependencies(tasks, [
        { id: 'd1', predecessorId: 'a', successorId: 'b', type: 'FS', lagDays: 0 },
        { id: 'd2', predecessorId: 'b', successorId: 'a', type: 'FS', lagDays: 0 },
      ]),
    ).toThrowError(/siklus/);
  });

  it('mendeteksi siklus calon dependensi', () => {
    const deps: DependencyInput[] = [
      { id: 'd1', predecessorId: 'a', successorId: 'b', type: 'FS', lagDays: 0 },
      { id: 'd2', predecessorId: 'b', successorId: 'c', type: 'FS', lagDays: 0 },
    ];
    expect(wouldCreateCycle(deps, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(deps, 'a', 'c')).toBe(false);
  });

  it('menolak dependensi yang melibatkan tugas induk', () => {
    const tasks = [
      task({ id: 'parent' }),
      task({ id: 'child', parentId: 'parent' }),
      task({ id: 'other' }),
    ];
    expect(() =>
      validateDependencies(tasks, [
        { id: 'd1', predecessorId: 'parent', successorId: 'other', type: 'FS', lagDays: 0 },
      ]),
    ).toThrowError(/tugas daun/);
  });

  it('menolak struktur parent-child lebih dari tiga level', () => {
    const tasks = [
      task({ id: 'l1' }),
      task({ id: 'l2', parentId: 'l1' }),
      task({ id: 'l3', parentId: 'l2' }),
      task({ id: 'l4', parentId: 'l3' }),
    ];
    expect(() =>
      scheduleProject({ tasks, dependencies: [], calendar: weekend, projectStart: '2026-10-19' }),
    ).toThrowError(/maksimal 3 level/);
  });

  it('menolak durasi tidak valid', () => {
    expect(() =>
      scheduleProject({
        tasks: [task({ id: 'a', durationDays: 0 })],
        dependencies: [],
        calendar: weekend,
        projectStart: '2026-10-19',
      }),
    ).toThrowError(/minimal 1 hari kerja/);
  });

  it('menolak kalender dengan tujuh hari libur', () => {
    expect(() =>
      scheduleProject({
        tasks: [task({ id: 'a' })],
        dependencies: [],
        calendar: { weekendDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] },
        projectStart: '2026-10-19',
      }),
    ).toThrowError(/Minimal harus ada satu hari kerja/);
  });
});

describe('summary task dan graph besar', () => {
  it('menghitung summary task tiga level dari anak-anaknya', () => {
    const tasks = [
      task({ id: 'root', durationDays: 99, progress: 99 }),
      task({ id: 'phase', parentId: 'root', durationDays: 50, progress: 80 }),
      task({ id: 'a', parentId: 'phase', startDate: '2026-10-19', durationDays: 3, progress: 100 }),
      task({ id: 'b', parentId: 'phase', startDate: '2026-10-19', durationDays: 2, progress: 0, position: 1 }),
    ];
    const result = scheduleProject({
      tasks,
      dependencies: [{ id: 'd1', predecessorId: 'a', successorId: 'b', type: 'FS', lagDays: 0 }],
      calendar: weekend,
      projectStart: '2026-10-19',
    });
    expect(result.byId.a?.scheduledStart).toBe('2026-10-19');
    expect(result.byId.b?.scheduledStart).toBe('2026-10-22');
    expect(result.byId.phase).toMatchObject({
      scheduledStart: '2026-10-19',
      scheduledEnd: '2026-10-23',
      durationDays: 5,
      progress: 60,
      isSummary: true,
    });
    expect(result.byId.root).toMatchObject({
      scheduledStart: '2026-10-19',
      scheduledEnd: '2026-10-23',
      durationDays: 5,
      isSummary: true,
    });
  });

  it('menjadwalkan graph berantai besar secara deterministik', () => {
    const tasks: ScheduleTaskInput[] = [];
    const dependencies: DependencyInput[] = [];
    for (let i = 0; i < 200; i += 1) {
      tasks.push(task({ id: `t${i}`, position: i, startDate: '2026-01-05', durationDays: 1 }));
      if (i > 0) {
        dependencies.push({
          id: `d${i}`,
          predecessorId: `t${i - 1}`,
          successorId: `t${i}`,
          type: 'FS',
          lagDays: 0,
        });
      }
    }
    const result = scheduleProject({
      tasks,
      dependencies,
      calendar: weekend,
      projectStart: '2026-01-05',
    });
    expect(Object.keys(result.byId)).toHaveLength(200);
    expect(result.leafIds).toHaveLength(200);
    expect(result.byId.t199?.scheduledStart > result.byId.t0?.scheduledStart).toBe(true);
  });
});
