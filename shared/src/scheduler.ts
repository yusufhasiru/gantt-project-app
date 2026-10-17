import { assertValidCalendar, isWorkingDay, nextWorkingDay, shiftWorkingDays, workingDaysBetween } from './calendar.js';
import { maxISODate, minISODate, parseISODate } from './dates.js';
import { DomainError } from './errors.js';
import { getChildrenMap, getLeafIds, getTaskDepth, MAX_TASK_DEPTH, sortTasks } from './tree.js';
import type {
  DependencyInput,
  ScheduleResult,
  ScheduleTaskInput,
  ScheduledValues,
  CalendarConfig,
} from './types.js';

export interface ScheduleParams {
  tasks: readonly ScheduleTaskInput[];
  dependencies: readonly DependencyInput[];
  calendar: CalendarConfig;
  projectStart: string;
}

export function validateTaskStructure(tasks: readonly ScheduleTaskInput[]): void {
  if (tasks.length === 0) return;
  const byId = new Map<string, ScheduleTaskInput>();
  for (const task of tasks) {
    if (byId.has(task.id)) {
      throw new DomainError('INVALID_STRUCTURE', `ID tugas duplikat: ${task.id}.`);
    }
    if (!Number.isInteger(task.durationDays) || task.durationDays < 1) {
      throw new DomainError(
        'INVALID_TASK_DURATION',
        `Durasi tugas "${task.id}" minimal 1 hari kerja.`,
      );
    }
    if (task.progress < 0 || task.progress > 100) {
      throw new DomainError('INVALID_TASK_PROGRESS', 'Progres tugas harus 0-100.');
    }
    parseISODate(task.startDate);
    byId.set(task.id, task);
  }

  for (const task of tasks) {
    if (task.parentId === task.id) {
      throw new DomainError('INVALID_STRUCTURE', 'Tugas tidak boleh menjadi induk dirinya sendiri.');
    }
    if (task.parentId && !byId.has(task.parentId)) {
      throw new DomainError(
        'INVALID_STRUCTURE',
        `Tugas induk "${task.parentId}" tidak ditemukan pada proyek ini.`,
      );
    }
    if (getTaskDepth(tasks, task.id) > MAX_TASK_DEPTH) {
      throw new DomainError(
        'MAX_DEPTH_EXCEEDED',
        `Kedalaman struktur tugas maksimal ${MAX_TASK_DEPTH} level.`,
      );
    }
  }
}

export function validateDependencies(
  tasks: readonly ScheduleTaskInput[],
  dependencies: readonly DependencyInput[],
): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const leafIds = new Set(getLeafIds(tasks));
  const seen = new Set<string>();

  for (const dep of dependencies) {
    const predecessor = byId.get(dep.predecessorId);
    const successor = byId.get(dep.successorId);
    if (!predecessor || !successor) {
      throw new DomainError(
        'INVALID_DEPENDENCY',
        'Dependensi merujuk tugas yang tidak ada pada proyek ini.',
      );
    }
    if (dep.predecessorId === dep.successorId) {
      throw new DomainError('SELF_DEPENDENCY', 'Tugas tidak boleh bergantung pada dirinya sendiri.');
    }
    if (!Number.isInteger(dep.lagDays) || dep.lagDays < -365 || dep.lagDays > 365) {
      throw new DomainError('INVALID_LAG', 'Lag harus bilangan bulat antara -365 dan 365 hari.');
    }
    if (dep.type !== 'FS' && dep.type !== 'SS') {
      throw new DomainError('INVALID_DEPENDENCY_TYPE', 'Tipe dependensi harus FS atau SS.');
    }
    const key = `${dep.predecessorId}::${dep.successorId}`;
    if (seen.has(key)) {
      throw new DomainError(
        'DUPLICATE_DEPENDENCY',
        'Dependensi antara kedua tugas tersebut sudah ada.',
      );
    }
    seen.add(key);
    if (!leafIds.has(dep.predecessorId) || !leafIds.has(dep.successorId)) {
      throw new DomainError(
        'NON_LEAF_DEPENDENCY',
        'Dependensi hanya boleh melibatkan tugas daun (tanpa sub-tugas).',
      );
    }
  }

  assertAcyclic(dependencies);
}

export function assertAcyclic(dependencies: readonly DependencyInput[]): void {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const nodes = new Set<string>();

  for (const dep of dependencies) {
    nodes.add(dep.predecessorId);
    nodes.add(dep.successorId);
    const list = adjacency.get(dep.predecessorId) ?? [];
    list.push(dep.successorId);
    adjacency.set(dep.predecessorId, list);
    indegree.set(dep.successorId, (indegree.get(dep.successorId) ?? 0) + 1);
    if (!indegree.has(dep.predecessorId)) indegree.set(dep.predecessorId, 0);
  }

  const queue = [...nodes].filter((node) => (indegree.get(node) ?? 0) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift() as string;
    visited += 1;
    for (const next of adjacency.get(node) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  if (visited !== nodes.size) {
    throw new DomainError(
      'CYCLE_DETECTED',
      'Dependensi membentuk siklus. Hapus salah satu dependensi terlebih dahulu.',
    );
  }
}

export function wouldCreateCycle(
  dependencies: readonly DependencyInput[],
  predecessorId: string,
  successorId: string,
): boolean {
  if (predecessorId === successorId) return true;
  const adjacency = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = adjacency.get(dep.predecessorId) ?? [];
    list.push(dep.successorId);
    adjacency.set(dep.predecessorId, list);
  }
  const stack = [successorId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === predecessorId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}

export function topologicalOrder(
  leafIds: readonly string[],
  dependencies: readonly DependencyInput[],
): string[] {
  const leafSet = new Set(leafIds);
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of leafIds) indegree.set(id, 0);

  for (const dep of dependencies) {
    if (!leafSet.has(dep.predecessorId) || !leafSet.has(dep.successorId)) continue;
    const list = adjacency.get(dep.predecessorId) ?? [];
    list.push(dep.successorId);
    adjacency.set(dep.predecessorId, list);
    indegree.set(dep.successorId, (indegree.get(dep.successorId) ?? 0) + 1);
  }

  const orderIndex = new Map(leafIds.map((id, index) => [id, index]));
  const ready = leafIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (ready.length > 0) {
    ready.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
    const node = ready.shift() as string;
    order.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) ready.push(next);
    }
  }

  if (order.length !== leafIds.length) {
    throw new DomainError(
      'CYCLE_DETECTED',
      'Dependensi membentuk siklus sehingga penjadwalan tidak dapat dilakukan.',
    );
  }
  return order;
}

/**
 * Menghitung jadwal seluruh tugas:
 * 1. Validasi struktur dan graph dependensi.
 * 2. Urutkan tugas daun secara topologis.
 * 3. Hitung tanggal mulai/selesai tugas daun.
 * 4. Hitung summary task dari level terdalam ke terluar.
 */
export function scheduleProject(params: ScheduleParams): ScheduleResult {
  const { tasks, dependencies, calendar, projectStart } = params;

  parseISODate(projectStart);
  assertValidCalendar(calendar);
  validateTaskStructure(tasks);
  validateDependencies(tasks, dependencies);

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const sorted = sortTasks(tasks);
  const leafIds = getLeafIds(sorted);
  const leafOrder = topologicalOrder(leafIds, dependencies);
  const childMap = getChildrenMap(sorted);
  const byIdOrdered = new Map(sorted.map((task) => [task.id, task]));

  const byIdResult: Record<string, ScheduledValues> = {};
  const incoming = new Map<string, DependencyInput[]>();
  for (const dep of dependencies) {
    const list = incoming.get(dep.successorId) ?? [];
    list.push(dep);
    incoming.set(dep.successorId, list);
  }

  for (const id of leafOrder) {
    const task = byIdOrdered.get(id) as ScheduleTaskInput;
    let base = task.startDate;

    for (const dep of incoming.get(id) ?? []) {
      const predecessor = byIdResult[dep.predecessorId];
      if (!predecessor) {
        throw new DomainError(
          'SCHEDULING_ERROR',
          `Pendahulu untuk tugas "${id}" belum dijadwalkan.`,
        );
      }
      const candidate =
        dep.type === 'FS'
          ? shiftWorkingDays(predecessor.scheduledEnd, 1 + dep.lagDays, calendar)
          : shiftWorkingDays(predecessor.scheduledStart, dep.lagDays, calendar);
      base = base > candidate ? base : candidate;
    }

    const scheduledStart = nextWorkingDay(base, calendar);
    const scheduledEnd = shiftWorkingDays(scheduledStart, task.durationDays - 1, calendar);
    byIdResult[id] = {
      scheduledStart,
      scheduledEnd,
      durationDays: task.durationDays,
      progress: Math.max(0, Math.min(100, Math.round(task.progress))),
      isSummary: false,
    };
  }

  // Summary task: dari level terdalam ke terluar.
  const summaryIds = sorted
    .filter((task) => (childMap.get(task.id) ?? []).length > 0)
    .sort((a, b) => getTaskDepth(sorted, b.id) - getTaskDepth(sorted, a.id))
    .map((task) => task.id);

  for (const id of summaryIds) {
    const children = childMap.get(id) ?? [];
    const childValues = children.map((child) => byIdResult[child.id]).filter(Boolean);
    if (childValues.length === 0) continue;

    const start = minISODate(childValues.map((value) => value.scheduledStart));
    const end = maxISODate(childValues.map((value) => value.scheduledEnd));
    const duration = workingDaysBetween(start, end, calendar);
    const totalWeight = childValues.reduce((sum, value) => sum + value.durationDays, 0);
    const weighted = childValues.reduce(
      (sum, value) => sum + value.progress * value.durationDays,
      0,
    );
    const progress = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;

    byIdResult[id] = {
      scheduledStart: start,
      scheduledEnd: end,
      durationDays: Math.max(1, duration),
      progress: Math.max(0, Math.min(100, progress)),
      isSummary: true,
    };
  }

  for (const task of tasks) {
    const value = byIdResult[task.id];
    if (!value) {
      throw new DomainError(
        'SCHEDULING_ERROR',
        `Tugas "${task.id}" tidak mendapatkan jadwal. Periksa struktur parent-child.`,
      );
    }
    if (value.scheduledStart > value.scheduledEnd) {
      throw new DomainError('SCHEDULING_ERROR', 'Tanggal selesai lebih awal dari tanggal mulai.');
    }
    if (!isWorkingDay(value.scheduledStart, calendar)) {
      throw new DomainError('SCHEDULING_ERROR', 'Tanggal mulai tidak berada pada hari kerja.');
    }
    if (!isWorkingDay(value.scheduledEnd, calendar)) {
      throw new DomainError('SCHEDULING_ERROR', 'Tanggal selesai tidak berada pada hari kerja.');
    }
  }

  const order = [...leafOrder, ...summaryIds];
  return { byId: byIdResult, order, leafIds };
}

/** Preview jadwal untuk drag/resize di client tanpa menyimpan apa pun. */
export function previewSchedule(params: ScheduleParams): Record<string, ScheduledValues> {
  return scheduleProject(params).byId;
}

export function durationForRange(
  start: string,
  end: string,
  calendar: CalendarConfig,
): number {
  return Math.max(1, workingDaysBetween(start, end, calendar));
}
