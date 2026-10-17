import { workingDaysBetween } from './calendar.js';
import { computeCostBreakdown } from './cost.js';
import { getLeafIds, sortTasks } from './tree.js';
import type {
  AssignmentRecord,
  CalendarConfig,
  ProjectMetrics,
  ResourceRecord,
  TaskRecord,
} from './types.js';

export function computeProjectMetrics(
  tasks: readonly TaskRecord[],
  resources: readonly ResourceRecord[],
  assignments: readonly AssignmentRecord[],
  calendar: CalendarConfig,
): ProjectMetrics {
  const leafIds = new Set(getLeafIds(tasks));
  const leaves = sortTasks(tasks).filter((task) => leafIds.has(task.id));
  const totalWeight = leaves.reduce((sum, task) => sum + task.durationDays, 0);
  const weightedProgress = leaves.reduce(
    (sum, task) => sum + task.progress * task.durationDays,
    0,
  );

  const starts = tasks.map((task) => task.scheduledStart).filter(Boolean);
  const ends = tasks.map((task) => task.scheduledEnd).filter(Boolean);
  const startDate = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const endDate = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : null;

  return {
    taskCount: tasks.length,
    leafCount: leaves.length,
    progress: totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0,
    startDate,
    endDate,
    totalWorkingDays:
      startDate && endDate ? workingDaysBetween(startDate, endDate, calendar) : 0,
    totalCost: computeCostBreakdown(tasks, resources, assignments).total,
  };
}
