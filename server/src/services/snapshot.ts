import { computeProjectMetrics } from '@gantt/shared';
import type { ProjectSnapshot } from '@gantt/shared';
import { prisma } from '../db.js';
import {
  calendarFor,
  serializeAssignment,
  serializeDependency,
  serializeProject,
  serializeResource,
  serializeTask,
  type ProjectWithHolidays,
} from './access.js';

export async function buildProjectSnapshot(project: ProjectWithHolidays): Promise<ProjectSnapshot> {
  const [tasks, dependencies, resources, assignments] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    }),
    prisma.dependency.findMany({
      where: { predecessor: { projectId: project.id } },
      orderBy: { id: 'asc' },
    }),
    prisma.resource.findMany({ where: { projectId: project.id }, orderBy: { name: 'asc' } }),
    prisma.assignment.findMany({ where: { task: { projectId: project.id } }, orderBy: { id: 'asc' } }),
  ]);

  const serializedTasks = tasks.map(serializeTask);
  const serializedResources = resources.map(serializeResource);
  const serializedAssignments = assignments.map(serializeAssignment);

  return {
    project: serializeProject(project),
    tasks: serializedTasks,
    dependencies: dependencies.map(serializeDependency),
    resources: serializedResources,
    assignments: serializedAssignments,
    metrics: computeProjectMetrics(
      serializedTasks,
      serializedResources,
      serializedAssignments,
      calendarFor(project),
    ),
  };
}
