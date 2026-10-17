import { describe, expect, it } from 'vitest';
import { computeCpm } from './cpm.js';
import { scheduleProject } from './scheduler.js';
import type { CalendarConfig, DependencyInput, ScheduleTaskInput } from './types.js';

const weekend: CalendarConfig = { weekendDays: [0, 6], holidays: [] };

function task(
  id: string,
  durationDays: number,
  position: number,
  startDate = '2026-10-19',
): ScheduleTaskInput {
  return { id, parentId: null, position, durationDays, startDate, progress: 0 };
}

function dep(
  predecessorId: string,
  successorId: string,
  type: 'FS' | 'SS' = 'FS',
  lagDays = 0,
): DependencyInput {
  return { id: `${predecessorId}-${successorId}`, predecessorId, successorId, type, lagDays };
}

function scheduled(tasks: ScheduleTaskInput[], deps: DependencyInput[], calendar = weekend) {
  const result = scheduleProject({
    tasks,
    dependencies: deps,
    calendar,
    projectStart: '2026-10-19',
  });
  return tasks.map((item) => ({
    id: item.id,
    name: item.id,
    durationDays: item.durationDays,
    scheduledStart: result.byId[item.id]!.scheduledStart,
    scheduledEnd: result.byId[item.id]!.scheduledEnd,
  }));
}

describe('CPM', () => {
  it('vektor wajib: A, C, D kritis; B float 3; PE = 8', () => {
    const tasks = [task('a', 3, 0), task('b', 2, 1), task('c', 5, 2), task('d', 1, 3)];
    const deps = [dep('a', 'b'), dep('a', 'c'), dep('b', 'd'), dep('c', 'd')];
    const result = computeCpm(scheduled(tasks, deps), deps, '2026-10-19', weekend);

    const rows = Object.fromEntries(result.tasks.map((row) => [row.id, row]));
    expect(rows.a).toMatchObject({ es: 0, ef: 2, ls: 0, lf: 2, totalFloat: 0, critical: true });
    expect(rows.b).toMatchObject({ es: 3, ef: 4, ls: 6, lf: 7, totalFloat: 3, critical: false });
    expect(rows.c).toMatchObject({ es: 3, ef: 7, ls: 3, lf: 7, totalFloat: 0, critical: true });
    expect(rows.d).toMatchObject({ es: 8, ef: 8, ls: 8, lf: 8, totalFloat: 0, critical: true });
    expect(result.projectEndOrdinal).toBe(8);
    expect(result.projectEndDate).toBe('2026-10-29');
    expect(result.criticalIds).toEqual(['a', 'c', 'd']);
    expect(result.criticalPaths).toEqual([['a', 'c', 'd']]);
    expect(result.totalWorkingDays).toBe(9);
    expect(result.hasNegativeFloat).toBe(false);
  });

  it('menemukan beberapa jalur kritis', () => {
    const tasks = [task('a', 1, 0), task('b', 2, 1), task('c', 2, 2), task('d', 1, 3)];
    const deps = [dep('a', 'b'), dep('a', 'c'), dep('b', 'd'), dep('c', 'd')];
    const result = computeCpm(scheduled(tasks, deps), deps, '2026-10-19', weekend);
    expect(result.criticalIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    const paths = result.criticalPaths.map((path) => path.join('-')).sort();
    expect(paths).toEqual(['a-b-d', 'a-c-d']);
  });

  it('menangani graph tanpa dependensi', () => {
    const tasks = [task('a', 2, 0), task('b', 5, 1), task('c', 3, 2)];
    const result = computeCpm(scheduled(tasks, []), [], '2026-10-19', weekend);
    expect(result.projectEndOrdinal).toBe(4);
    expect(result.criticalIds).toEqual(['b']);
    expect(result.tasks.find((row) => row.id === 'a')?.totalFloat).toBe(3);
  });

  it('menangani dependensi SS dan lag positif', () => {
    const tasks = [task('a', 5, 0), task('b', 2, 1), task('c', 1, 2)];
    const deps = [dep('a', 'b', 'SS', 2), dep('a', 'c', 'FS', 0)];
    const result = computeCpm(scheduled(tasks, deps), deps, '2026-10-19', weekend);
    const rows = Object.fromEntries(result.tasks.map((row) => [row.id, row]));
    expect(rows.a).toMatchObject({ es: 0, ef: 4, critical: true });
    expect(rows.b).toMatchObject({ es: 2, ef: 3, ls: 4, lf: 5, totalFloat: 2, critical: false });
    expect(rows.c).toMatchObject({ es: 5, ef: 5, critical: true });
    expect(result.projectEndOrdinal).toBe(5);
  });

  it('menangani lag negatif FS', () => {
    const tasks = [task('a', 4, 0), task('b', 2, 1)];
    const deps = [dep('a', 'b', 'FS', -1)];
    const result = computeCpm(scheduled(tasks, deps), deps, '2026-10-19', weekend);
    const rows = Object.fromEntries(result.tasks.map((row) => [row.id, row]));
    // A: 19-22 Okt (4 hari). FS lag -1 => B boleh mulai 22 Okt, yaitu ordinal 3.
    expect(rows.b).toMatchObject({ es: 3, ef: 4, critical: true });
    expect(result.projectEndOrdinal).toBe(4);
  });

  it('mengembalikan hasil kosong untuk proyek tanpa tugas', () => {
    const result = computeCpm([], [], '2026-10-19', weekend);
    expect(result.tasks).toEqual([]);
    expect(result.criticalPaths).toEqual([]);
    expect(result.projectEndDate).toBe('2026-10-19');
  });
});
