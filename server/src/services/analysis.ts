import {
  computeCostBreakdown,
  computeCpm,
  computePert,
  computeWorkload,
  getLeafIds,
} from '@gantt/shared';
import type { PertResult } from '@gantt/shared';
import { buildProjectSnapshot } from './snapshot.js';
import { calendarFor, type ProjectWithHolidays } from './access.js';

export async function buildProjectAnalysis(project: ProjectWithHolidays) {
  const snapshot = await buildProjectSnapshot(project);
  const calendar = calendarFor(project);
  const leafIds = new Set(getLeafIds(snapshot.tasks));
  const leafTasks = snapshot.tasks.filter((task) => leafIds.has(task.id));
  const leafDependencies = snapshot.dependencies.filter(
    (dependency) => leafIds.has(dependency.predecessorId) && leafIds.has(dependency.successorId),
  );

  const cpm = computeCpm(
    leafTasks.map((task) => ({
      id: task.id,
      name: task.name,
      durationDays: task.durationDays,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd,
    })),
    leafDependencies,
    project.startDate,
    calendar,
  );

  const primaryPath =
    cpm.criticalPaths.length > 0 ? cpm.criticalPaths[0] : cpm.criticalIds;
  const pert: PertResult = computePert(
    leafTasks.map((task) => ({
      id: task.id,
      name: task.name,
      durationDays: task.durationDays,
      optimisticDays: task.optimisticDays,
      pessimisticDays: task.pessimisticDays,
    })),
    primaryPath,
  );

  const cost = computeCostBreakdown(snapshot.tasks, snapshot.resources, snapshot.assignments);
  const workload = computeWorkload(
    snapshot.tasks,
    snapshot.resources,
    snapshot.assignments,
    calendar,
  );

  return {
    metrics: snapshot.metrics,
    calendar,
    projectStart: project.startDate,
    cpm,
    pert,
    primaryCriticalPath: primaryPath,
    cost,
    workload,
  };
}
