import type { Holiday, Project, Resource, Task, Dependency, Assignment } from '@prisma/client';
import type {
  AssignmentRecord,
  CalendarConfig,
  DependencyRecord,
  ProjectRecord,
  ResourceRecord,
  TaskRecord,
} from '@gantt/shared';
import { prisma } from '../db.js';
import { ApiError } from '../http.js';

export type ProjectWithHolidays = Project & { holidays: Holiday[] };

export function parseWeekendDays(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((day) => Number.isInteger(day))) {
      return parsed as number[];
    }
  } catch {
    // Nilai rusak ditangani sebagai kalender default di bawah.
  }
  return [0, 6];
}

export function serializeProject(project: ProjectWithHolidays): ProjectRecord & { holidays: ProjectWithHolidays['holidays'] } {
  return {
    id: project.id,
    ownerId: project.ownerId,
    name: project.name,
    description: project.description,
    startDate: project.startDate,
    weekendDays: parseWeekendDays(project.weekendDays),
    createdAt: project.createdAt.toISOString(),
    holidays: project.holidays,
  };
}

export function calendarFor(project: ProjectWithHolidays): CalendarConfig {
  return {
    weekendDays: parseWeekendDays(project.weekendDays),
    holidays: project.holidays.map((holiday) => holiday.date),
  };
}

export function serializeTask(task: Task): TaskRecord {
  return {
    id: task.id,
    projectId: task.projectId,
    parentId: task.parentId,
    position: task.position,
    name: task.name,
    description: task.description,
    durationDays: task.durationDays,
    startDate: task.startDate,
    scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd,
    priority: task.priority as TaskRecord['priority'],
    color: task.color,
    progress: task.progress,
    optimisticDays: task.optimisticDays,
    pessimisticDays: task.pessimisticDays,
  };
}

export function serializeDependency(dependency: Dependency): DependencyRecord {
  return {
    id: dependency.id,
    predecessorId: dependency.predecessorId,
    successorId: dependency.successorId,
    type: dependency.type as DependencyRecord['type'],
    lagDays: dependency.lagDays,
  };
}

export function serializeResource(resource: Resource): ResourceRecord {
  return {
    id: resource.id,
    projectId: resource.projectId,
    name: resource.name,
    email: resource.email,
    role: resource.role,
    salary: resource.salary,
  };
}

export function serializeAssignment(assignment: Assignment): AssignmentRecord {
  return {
    id: assignment.id,
    taskId: assignment.taskId,
    resourceId: assignment.resourceId,
    allocationPercent: assignment.allocationPercent,
  };
}

export async function getOwnedProject(userId: string, projectId: string): Promise<ProjectWithHolidays> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { holidays: { orderBy: { date: 'asc' } } },
  });
  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Proyek tidak ditemukan.');
  }
  return project;
}

export type TaskWithProject = Task & { project: Project };

export async function getOwnedTask(userId: string, taskId: string): Promise<TaskWithProject> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { ownerId: userId } },
    include: { project: true },
  });
  if (!task) {
    throw new ApiError(404, 'TASK_NOT_FOUND', 'Tugas tidak ditemukan.');
  }
  return task;
}

export async function getOwnedDependency(userId: string, dependencyId: string) {
  const dependency = await prisma.dependency.findFirst({
    where: { id: dependencyId, successor: { project: { ownerId: userId } } },
    include: { successor: { include: { project: true } } },
  });
  if (!dependency) {
    throw new ApiError(404, 'DEPENDENCY_NOT_FOUND', 'Dependensi tidak ditemukan.');
  }
  return dependency;
}

export async function getOwnedResource(userId: string, resourceId: string) {
  const resource = await prisma.resource.findFirst({
    where: { id: resourceId, project: { ownerId: userId } },
    include: { project: true },
  });
  if (!resource) {
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Anggota tim tidak ditemukan.');
  }
  return resource;
}

export async function getOwnedAssignment(userId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      task: { project: { ownerId: userId } },
    },
    include: { task: { include: { project: true } } },
  });
  if (!assignment) {
    throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND', 'Alokasi tidak ditemukan.');
  }
  return assignment;
}

export async function getOwnedHoliday(userId: string, holidayId: string) {
  const holiday = await prisma.holiday.findFirst({
    where: { id: holidayId, project: { ownerId: userId } },
    include: { project: true },
  });
  if (!holiday) {
    throw new ApiError(404, 'HOLIDAY_NOT_FOUND', 'Hari libur tidak ditemukan.');
  }
  return holiday;
}
