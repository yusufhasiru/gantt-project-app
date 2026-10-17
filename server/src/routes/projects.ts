import { Router } from 'express';
import type { Assignment, Resource, Task } from '@prisma/client';
import {
  calendarUpdateSchema,
  computeProjectMetrics,
  getTaskDepth,
  holidayCreateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  taskCreateSchema,
  resourceCreateSchema,
} from '@gantt/shared';
import { prisma } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  calendarFor,
  getOwnedProject,
  serializeProject,
  serializeResource,
  serializeTask,
  type ProjectWithHolidays,
} from '../services/access.js';
import { buildProjectSnapshot } from '../services/snapshot.js';
import { recomputeProjectSchedule } from '../services/recompute.js';
import { buildProjectAnalysis } from '../services/analysis.js';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

type ProjectSummarySource = ProjectWithHolidays & {
  tasks: Task[];
  resources: Resource[];
  assignments: Assignment[];
};

function serializeProjectSummary(project: ProjectSummarySource) {
  const tasks = project.tasks.map(serializeTask);
  const resources = project.resources.map(serializeResource);
  const assignments = project.assignments.map((assignment) => ({
    id: assignment.id,
    taskId: assignment.taskId,
    resourceId: assignment.resourceId,
    allocationPercent: assignment.allocationPercent,
  }));
  return {
    ...serializeProject(project),
    metrics: computeProjectMetrics(tasks, resources, assignments, calendarFor(project)),
  };
}

projectsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({
      where: { ownerId: userId(res) },
      orderBy: { createdAt: 'desc' },
      include: {
        holidays: { orderBy: { date: 'asc' } },
        tasks: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: { assignments: true },
        },
        resources: true,
      },
    });

    res.json({
      projects: projects.map((project) =>
        serializeProjectSummary({
          ...project,
          assignments: project.tasks.flatMap((task) => task.assignments),
        }),
      ),
    });
  }),
);

projectsRouter.post(
  '/',
  validateBody(projectCreateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { name: string; description?: string | null; startDate: string; weekendDays?: number[] };
    const project = await prisma.project.create({
      data: {
        ownerId: userId(res),
        name: body.name,
        description: body.description ?? null,
        startDate: body.startDate,
        weekendDays: JSON.stringify(body.weekendDays ?? [0, 6]),
      },
      include: { holidays: true },
    });
    res.status(201).json(await buildProjectSnapshot(project));
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(userId(res), req.params.id);
    res.json(await buildProjectSnapshot(project));
  }),
);

projectsRouter.patch(
  '/:id',
  validateBody(projectUpdateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const project = await getOwnedProject(ownerId, req.params.id);
    const body = req.body as { name?: string; description?: string | null; startDate?: string };

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        },
      });
      if (body.startDate !== undefined) {
        await recomputeProjectSchedule(tx, project.id);
      }
    });

    const fresh = await getOwnedProject(ownerId, project.id);
    res.json(await buildProjectSnapshot(fresh));
  }),
);

projectsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(userId(res), req.params.id);
    await prisma.project.delete({ where: { id: project.id } });
    res.status(204).end();
  }),
);

projectsRouter.post(
  '/:id/tasks',
  validateBody(taskCreateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const project = await getOwnedProject(ownerId, req.params.id);
    const body = req.body as {
      name: string;
      description?: string | null;
      parentId?: string | null;
      durationDays: number;
      startDate: string;
      optimisticDays?: number | null;
      pessimisticDays?: number | null;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      color?: string;
      progress?: number;
    };
    const parentId = body.parentId ?? null;

    const tasks = await prisma.$transaction(async (tx) => {
      if (parentId) {
        const parent = await tx.task.findFirst({ where: { id: parentId, projectId: project.id } });
        if (!parent) {
          throw new ApiError(422, 'INVALID_PARENT', 'Tugas induk tidak ditemukan pada proyek ini.');
        }
        const allTasks = await tx.task.findMany({ where: { projectId: project.id } });
        if (getTaskDepth(allTasks, parentId) + 1 > 3) {
          throw new ApiError(422, 'MAX_DEPTH_EXCEEDED', 'Kedalaman struktur tugas maksimal 3 level.');
        }
        const [dependencyCount, assignmentCount] = await Promise.all([
          tx.dependency.count({
            where: { OR: [{ predecessorId: parentId }, { successorId: parentId }] },
          }),
          tx.assignment.count({ where: { taskId: parentId } }),
        ]);
        if (dependencyCount + assignmentCount > 0) {
          throw new ApiError(
            409,
            'PARENT_HAS_RELATIONS',
            'Tugas yang sudah memiliki dependensi atau alokasi tidak dapat dijadikan induk. Hapus relasinya terlebih dahulu.',
          );
        }
      }

      const maxPosition = await tx.task.aggregate({
        where: { projectId: project.id, parentId },
        _max: { position: true },
      });

      await tx.task.create({
        data: {
          projectId: project.id,
          parentId,
          position: (maxPosition._max.position ?? -1) + 1,
          name: body.name,
          description: body.description ?? null,
          durationDays: body.durationDays,
          startDate: body.startDate,
          scheduledStart: body.startDate,
          scheduledEnd: body.startDate,
          priority: body.priority ?? 'MEDIUM',
          color: body.color ?? '#6366f1',
          progress: body.progress ?? 0,
          optimisticDays: body.optimisticDays ?? null,
          pessimisticDays: body.pessimisticDays ?? null,
        },
      });

      return recomputeProjectSchedule(tx, project.id);
    });

    res.status(201).json({ tasks });
  }),
);

projectsRouter.get(
  '/:id/resources',
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(userId(res), req.params.id);
    const resources = await prisma.resource.findMany({
      where: { projectId: project.id },
      orderBy: { name: 'asc' },
    });
    res.json({ resources: resources.map(serializeResource) });
  }),
);

projectsRouter.post(
  '/:id/resources',
  validateBody(resourceCreateSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(userId(res), req.params.id);
    const body = req.body as { name: string; email: string; role: string; salary: number };
    const resource = await prisma.resource.create({
      data: { projectId: project.id, ...body },
    });
    res.status(201).json({ resource: serializeResource(resource) });
  }),
);

projectsRouter.put(
  '/:id/calendar',
  validateBody(calendarUpdateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const project = await getOwnedProject(ownerId, req.params.id);
    const body = req.body as { weekendDays: number[] };

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: { weekendDays: JSON.stringify(body.weekendDays) },
      });
      return recomputeProjectSchedule(tx, project.id);
    });

    const fresh = await getOwnedProject(ownerId, project.id);
    res.json({ project: serializeProject(fresh), tasks });
  }),
);

projectsRouter.post(
  '/:id/holidays',
  validateBody(holidayCreateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const project = await getOwnedProject(ownerId, req.params.id);
    const body = req.body as { date: string; name: string };

    const existing = await prisma.holiday.findFirst({
      where: { projectId: project.id, date: body.date },
    });
    if (existing) {
      throw new ApiError(409, 'HOLIDAY_EXISTS', 'Hari libur pada tanggal tersebut sudah ada.');
    }

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.holiday.create({ data: { projectId: project.id, date: body.date, name: body.name } });
      return recomputeProjectSchedule(tx, project.id);
    });

    const fresh = await getOwnedProject(ownerId, project.id);
    res.status(201).json({ project: serializeProject(fresh), tasks });
  }),
);

projectsRouter.get(
  '/:id/analysis',
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(userId(res), req.params.id);
    res.json(await buildProjectAnalysis(project));
  }),
);

