import { enumerateWorkingDays } from './calendar.js';
import { getLeafIds } from './tree.js';
import type {
  AssignmentRecord,
  CalendarConfig,
  ResourceRecord,
  TaskRecord,
} from './types.js';

export const WORKING_DAYS_PER_MONTH = 22;

export function dailyRate(monthlySalary: number): number {
  return monthlySalary / WORKING_DAYS_PER_MONTH;
}

export interface TaskCostRow {
  taskId: string;
  durationDays: number;
  cost: number;
}

export interface ResourceCostRow {
  resourceId: string;
  name: string;
  role: string;
  salary: number;
  cost: number;
  allocationCount: number;
}

export interface CostBreakdown {
  total: number;
  byTask: TaskCostRow[];
  byResource: ResourceCostRow[];
}

interface CostTaskLike {
  id: string;
  durationDays: number;
}

export function computeTaskCost(
  task: CostTaskLike,
  assignments: readonly AssignmentRecord[],
  resourcesById: Map<string, ResourceRecord>,
): number {
  return assignments
    .filter((assignment) => assignment.taskId === task.id)
    .reduce((sum, assignment) => {
      const resource = resourcesById.get(assignment.resourceId);
      if (!resource) return sum;
      return (
        sum +
        dailyRate(resource.salary) *
          task.durationDays *
          (assignment.allocationPercent / 100)
      );
    }, 0);
}

/**
 * Biaya hanya dihitung dari tugas daun agar summary task tidak menggandakan biaya.
 */
export function computeCostBreakdown(
  tasks: readonly TaskRecord[],
  resources: readonly ResourceRecord[],
  assignments: readonly AssignmentRecord[],
): CostBreakdown {
  const leafIds = new Set(getLeafIds(tasks));
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const byTask: TaskCostRow[] = [];
  const resourceTotals = new Map<string, ResourceCostRow>();

  for (const task of tasks) {
    if (!leafIds.has(task.id)) continue;
    const cost = computeTaskCost(task, assignments, resourcesById);
    byTask.push({ taskId: task.id, durationDays: task.durationDays, cost });
    for (const assignment of assignments.filter((item) => item.taskId === task.id)) {
      const resource = resourcesById.get(assignment.resourceId);
      if (!resource) continue;
      const current = resourceTotals.get(resource.id) ?? {
        resourceId: resource.id,
        name: resource.name,
        role: resource.role,
        salary: resource.salary,
        cost: 0,
        allocationCount: 0,
      };
      current.cost +=
        dailyRate(resource.salary) *
        task.durationDays *
        (assignment.allocationPercent / 100);
      current.allocationCount += 1;
      resourceTotals.set(resource.id, current);
    }
  }

  return {
    total: byTask.reduce((sum, row) => sum + row.cost, 0),
    byTask,
    byResource: [...resourceTotals.values()].sort((a, b) => b.cost - a.cost),
  };
}

export interface OverAllocation {
  resourceId: string;
  resourceName: string;
  date: string;
  totalPercent: number;
  tasks: Array<{ taskId: string; allocationPercent: number }>;
}

export interface WorkloadSummary {
  overAllocations: OverAllocation[];
  peakByResource: Record<string, number>;
}

/**
 * Menjumlahkan alokasi per resource per hari kerja aktual.
 * Peringatan muncul bila total melebihi 100% pada hari yang sama.
 */
export function computeWorkload(
  tasks: readonly TaskRecord[],
  resources: readonly ResourceRecord[],
  assignments: readonly AssignmentRecord[],
  calendar: CalendarConfig,
): WorkloadSummary {
  const leafIds = new Set(getLeafIds(tasks));
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const perDay = new Map<string, Map<string, number>>();

  for (const task of tasks) {
    if (!leafIds.has(task.id)) continue;
    const taskAssignments = assignments.filter((item) => item.taskId === task.id);
    if (taskAssignments.length === 0) continue;
    const days = enumerateWorkingDays(task.scheduledStart, task.scheduledEnd, calendar);
    for (const day of days) {
      const dayMap = perDay.get(day) ?? new Map<string, number>();
      for (const assignment of taskAssignments) {
        if (!resourcesById.has(assignment.resourceId)) continue;
        dayMap.set(
          assignment.resourceId,
          (dayMap.get(assignment.resourceId) ?? 0) + assignment.allocationPercent,
        );
      }
      perDay.set(day, dayMap);
    }
  }

  const overAllocations: OverAllocation[] = [];
  const peakByResource: Record<string, number> = {};

  for (const [date, dayMap] of perDay) {
    for (const [resourceId, total] of dayMap) {
      const resource = resourcesById.get(resourceId);
      if (!resource) continue;
      peakByResource[resourceId] = Math.max(peakByResource[resourceId] ?? 0, total);
      if (total <= 100) continue;
      const taskIds = tasks
        .filter(
          (task) =>
            leafIds.has(task.id) &&
            task.scheduledStart <= date &&
            task.scheduledEnd >= date &&
            assignments.some(
              (assignment) =>
                assignment.taskId === task.id && assignment.resourceId === resourceId,
            ),
        )
        .map((task) => ({
          taskId: task.id,
          allocationPercent:
            assignments.find(
              (assignment) =>
                assignment.taskId === task.id && assignment.resourceId === resourceId,
            )?.allocationPercent ?? 0,
        }));
      overAllocations.push({
        resourceId,
        resourceName: resource.name,
        date,
        totalPercent: total,
        tasks: taskIds,
      });
    }
  }

  overAllocations.sort((a, b) =>
    a.date === b.date ? a.resourceId.localeCompare(b.resourceId) : a.date.localeCompare(b.date),
  );

  return { overAllocations, peakByResource };
}
