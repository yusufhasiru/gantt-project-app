import { describe, expect, it } from 'vitest';
import { computeCostBreakdown, computeTaskCost, computeWorkload, dailyRate } from './cost.js';
import type { AssignmentRecord, CalendarConfig, ResourceRecord, TaskRecord } from './types.js';

const weekend: CalendarConfig = { weekendDays: [0, 6], holidays: [] };

function resource(id: string, salary: number, name = id): ResourceRecord {
  return { id, projectId: 'p', name, email: `${id}@example.com`, role: 'Developer', salary };
}

function taskRecord(partial: Partial<TaskRecord> & { id: string }): TaskRecord {
  return {
    projectId: 'p',
    parentId: null,
    position: 0,
    name: partial.id,
    description: null,
    durationDays: 1,
    startDate: '2026-10-19',
    scheduledStart: '2026-10-19',
    scheduledEnd: '2026-10-19',
    priority: 'MEDIUM',
    color: '#6366f1',
    progress: 0,
    optimisticDays: null,
    pessimisticDays: null,
    ...partial,
  };
}

const andi = resource('andi', 22_000_000);
const budi = resource('budi', 11_000_000);

describe('biaya', () => {
  it('menghitung tarif harian dari gaji bulanan', () => {
    expect(dailyRate(22_000_000)).toBe(1_000_000);
  });

  it('menghitung biaya tugas berdasarkan durasi dan alokasi', () => {
    const assignments: AssignmentRecord[] = [
      { id: 'as1', taskId: 't1', resourceId: 'andi', allocationPercent: 100 },
      { id: 'as2', taskId: 't1', resourceId: 'budi', allocationPercent: 50 },
    ];
    const cost = computeTaskCost(
      { id: 't1', durationDays: 10 },
      assignments,
      new Map([
        [andi.id, andi],
        [budi.id, budi],
      ]),
    );
    expect(cost).toBe(10_000_000 + 2_500_000);
  });

  it('tidak menggandakan biaya pada summary task', () => {
    const parent = taskRecord({ id: 'parent', durationDays: 5 });
    const child = taskRecord({ id: 'child', parentId: 'parent', durationDays: 5, scheduledEnd: '2026-10-23' });
    const assignments: AssignmentRecord[] = [
      { id: 'as1', taskId: 'child', resourceId: 'andi', allocationPercent: 100 },
      { id: 'as2', taskId: 'parent', resourceId: 'andi', allocationPercent: 100 },
    ];
    const breakdown = computeCostBreakdown([parent, child], [andi], assignments);
    expect(breakdown.total).toBe(5_000_000);
    expect(breakdown.byTask).toHaveLength(1);
    expect(breakdown.byResource[0]).toMatchObject({ resourceId: 'andi', cost: 5_000_000 });
  });

  it('menghitung biaya untuk tugas daun saja tanpa assignment sebagai nol', () => {
    const tasks = [taskRecord({ id: 'a', durationDays: 2 })];
    const breakdown = computeCostBreakdown(tasks, [andi], []);
    expect(breakdown.total).toBe(0);
  });
});

describe('beban kerja', () => {
  const tasks = [
    taskRecord({
      id: 'a',
      scheduledStart: '2026-10-19',
      scheduledEnd: '2026-10-21',
      durationDays: 3,
    }),
    taskRecord({
      id: 'b',
      scheduledStart: '2026-10-20',
      scheduledEnd: '2026-10-20',
      durationDays: 1,
      position: 1,
    }),
  ];

  it('menandai over-alokasi ketika total melebihi 100% pada hari yang sama', () => {
    const assignments: AssignmentRecord[] = [
      { id: 'as1', taskId: 'a', resourceId: 'andi', allocationPercent: 60 },
      { id: 'as2', taskId: 'b', resourceId: 'andi', allocationPercent: 60 },
    ];
    const result = computeWorkload(tasks, [andi], assignments, weekend);
    expect(result.overAllocations).toHaveLength(1);
    expect(result.overAllocations[0]).toMatchObject({
      resourceId: 'andi',
      date: '2026-10-20',
      totalPercent: 120,
    });
    expect(result.peakByResource.andi).toBe(120);
  });

  it('tidak memperingatkan alokasi tepat 100%', () => {
    const assignments: AssignmentRecord[] = [
      { id: 'as1', taskId: 'a', resourceId: 'andi', allocationPercent: 50 },
      { id: 'as2', taskId: 'b', resourceId: 'andi', allocationPercent: 50 },
    ];
    const result = computeWorkload(tasks, [andi], assignments, weekend);
    expect(result.overAllocations).toHaveLength(0);
    expect(result.peakByResource.andi).toBe(100);
  });

  it('mengabaikan akhir pekan saat menghitung tumpang tindih', () => {
    const weekendTasks = [
      taskRecord({ id: 'a', scheduledStart: '2026-10-23', scheduledEnd: '2026-10-26', durationDays: 2 }),
    ];
    const assignments: AssignmentRecord[] = [
      { id: 'as1', taskId: 'a', resourceId: 'andi', allocationPercent: 100 },
    ];
    const result = computeWorkload(weekendTasks, [andi], assignments, {
      weekendDays: [0, 6],
      holidays: ['2026-10-26'],
    });
    expect(result.overAllocations).toHaveLength(0);
    expect(result.peakByResource.andi).toBe(100);
  });
});
