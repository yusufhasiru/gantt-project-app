import type { Prisma, Task } from '@prisma/client';
import { scheduleProject } from '@gantt/shared';
import type { ScheduleTaskInput, TaskRecord } from '@gantt/shared';
import { ApiError } from '../http.js';
import { calendarFor, serializeTask } from './access.js';

export type TxClient = Prisma.TransactionClient;

function toScheduleInput(task: Task): ScheduleTaskInput {
  return {
    id: task.id,
    parentId: task.parentId,
    position: task.position,
    durationDays: task.durationDays,
    startDate: task.startDate,
    progress: task.progress,
  };
}

/**
 * Menghitung ulang seluruh jadwal proyek lalu menyimpan perubahan di dalam transaksi.
 * Jika graph tidak valid, error dilempar sebelum ada perubahan yang disimpan.
 */
export async function recomputeProjectSchedule(
  tx: TxClient,
  projectId: string,
): Promise<TaskRecord[]> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    include: { holidays: true },
  });
  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Proyek tidak ditemukan.');
  }

  const [tasks, dependencies] = await Promise.all([
    tx.task.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    tx.dependency.findMany({
      where: { predecessor: { projectId } },
      orderBy: { id: 'asc' },
    }),
  ]);

  const result = scheduleProject({
    tasks: tasks.map(toScheduleInput),
    dependencies: dependencies.map((dependency) => ({
      id: dependency.id,
      predecessorId: dependency.predecessorId,
      successorId: dependency.successorId,
      type: dependency.type as 'FS' | 'SS',
      lagDays: dependency.lagDays,
    })),
    calendar: calendarFor(project),
    projectStart: project.startDate,
  });

  for (const task of tasks) {
    const next = result.byId[task.id];
    if (!next) continue;
    if (
      task.scheduledStart !== next.scheduledStart ||
      task.scheduledEnd !== next.scheduledEnd ||
      task.durationDays !== next.durationDays ||
      task.progress !== next.progress
    ) {
      await tx.task.update({
        where: { id: task.id },
        data: {
          scheduledStart: next.scheduledStart,
          scheduledEnd: next.scheduledEnd,
          durationDays: next.durationDays,
          progress: next.progress,
        },
      });
    }
  }

  const refreshed = await tx.task.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  return refreshed.map(serializeTask);
}

export async function recomputeInTransaction(projectId: string): Promise<TaskRecord[]> {
  const { prisma } = await import('../db.js');
  return prisma.$transaction((tx) => recomputeProjectSchedule(tx, projectId));
}
