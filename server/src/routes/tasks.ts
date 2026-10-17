import { Router } from 'express';
import {
  assignmentCreateSchema,
  dependencyCreateSchema,
  getDescendantIds,
  getTaskDepth,
  isValidThreePoint,
  moveTaskSchema,
  taskUpdateSchema,
  wouldCreateCycle,
} from '@gantt/shared';
import { prisma } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { userId } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getOwnedTask, serializeAssignment, serializeTask } from '../services/access.js';
import { recomputeProjectSchedule } from '../services/recompute.js';

export const tasksRouter = Router();

const SUMMARY_EDITABLE_FIELDS = new Set(['name', 'description', 'color', 'priority']);

async function currentTasks(projectId: string) {
  const rows = await prisma.task.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  return rows.map(serializeTask);
}

tasksRouter.patch(
  '/:id',
  validateBody(taskUpdateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const task = await getOwnedTask(ownerId, req.params.id);
    const body = req.body as Record<string, unknown>;
    const projectId = task.projectId;

    const childCount = await prisma.task.count({ where: { parentId: task.id } });
    const isSummary = childCount > 0;

    if (isSummary) {
      const forbidden = Object.keys(body).filter((key) => !SUMMARY_EDITABLE_FIELDS.has(key));
      if (forbidden.length > 0) {
        throw new ApiError(
          422,
          'SUMMARY_TASK_READ_ONLY',
          'Tugas induk dihitung otomatis. Hanya nama, deskripsi, warna, dan prioritas yang dapat diubah.',
          { forbiddenFields: forbidden },
        );
      }
    }

    if (!isSummary) {
      const duration =
        typeof body.durationDays === 'number' ? body.durationDays : task.durationDays;
      const optimistic =
        'optimisticDays' in body
          ? (body.optimisticDays as number | null | undefined) ?? null
          : task.optimisticDays;
      const pessimistic =
        'pessimisticDays' in body
          ? (body.pessimisticDays as number | null | undefined) ?? null
          : task.pessimisticDays;
      if (
        (optimistic !== null || pessimistic !== null) &&
        !isValidThreePoint(duration, optimistic, pessimistic)
      ) {
        throw new ApiError(
          422,
          'INVALID_PERT_ESTIMATE',
          'Estimasi PERT harus lengkap: optimistis ≤ durasi ≤ pesimistis.',
        );
      }
    }

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          ...(body.name !== undefined ? { name: body.name as string } : {}),
          ...(body.description !== undefined
            ? { description: body.description as string | null }
            : {}),
          ...(body.color !== undefined ? { color: body.color as string } : {}),
          ...(body.priority !== undefined
            ? { priority: body.priority as 'LOW' | 'MEDIUM' | 'HIGH' }
            : {}),
          ...(!isSummary && body.durationDays !== undefined
            ? { durationDays: body.durationDays as number }
            : {}),
          ...(!isSummary && body.startDate !== undefined
            ? { startDate: body.startDate as string }
            : {}),
          ...(!isSummary && body.progress !== undefined
            ? { progress: body.progress as number }
            : {}),
          ...(!isSummary && 'optimisticDays' in body
            ? { optimisticDays: (body.optimisticDays as number | null) ?? null }
            : {}),
          ...(!isSummary && 'pessimisticDays' in body
            ? { pessimisticDays: (body.pessimisticDays as number | null) ?? null }
            : {}),
        },
      });
      return recomputeProjectSchedule(tx, projectId);
    });

    res.json({ tasks });
  }),
);

tasksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const task = await getOwnedTask(ownerId, req.params.id);
    const projectId = task.projectId;

    const allTasks = await prisma.task.findMany({ where: { projectId } });
    const descendantIds = getDescendantIds(allTasks, task.id);
    const ids = [task.id, ...descendantIds];
    const depthOf = new Map(allTasks.map((item) => [item.id, getTaskDepth(allTasks, item.id)]));
    const orderedForDeletion = [...ids].sort(
      (a, b) => (depthOf.get(b) ?? 0) - (depthOf.get(a) ?? 0),
    );

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.assignment.deleteMany({ where: { taskId: { in: ids } } });
      await tx.dependency.deleteMany({
        where: { OR: [{ predecessorId: { in: ids } }, { successorId: { in: ids } }] },
      });
      for (const id of orderedForDeletion) {
        await tx.task.delete({ where: { id } });
      }
      return recomputeProjectSchedule(tx, projectId);
    });

    res.json({ tasks });
  }),
);

tasksRouter.post(
  '/:id/move',
  validateBody(moveTaskSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const task = await getOwnedTask(ownerId, req.params.id);
    const body = req.body as { parentId: string | null; position: number };
    const projectId = task.projectId;

    const tasks = await prisma.$transaction(async (tx) => {
      const allTasks = await tx.task.findMany({ where: { projectId } });
      const targetParentId = body.parentId;

      if (targetParentId === task.id) {
        throw new ApiError(422, 'INVALID_PARENT', 'Tugas tidak dapat menjadi induk dirinya sendiri.');
      }
      if (targetParentId) {
        const parent = allTasks.find((item) => item.id === targetParentId);
        if (!parent) {
          throw new ApiError(422, 'INVALID_PARENT', 'Tugas induk tujuan tidak ditemukan.');
        }
        const descendants = new Set(getDescendantIds(allTasks, task.id));
        if (descendants.has(targetParentId)) {
          throw new ApiError(
            422,
            'INVALID_PARENT',
            'Tugas tidak dapat dipindahkan ke bawah keturunannya sendiri.',
          );
        }
      }

      const subtreeDepth = Math.max(
        0,
        ...getDescendantIds(allTasks, task.id).map(
          (id) => getTaskDepth(allTasks, id) - getTaskDepth(allTasks, task.id),
        ),
      );
      const targetDepth = targetParentId ? getTaskDepth(allTasks, targetParentId) + 1 : 1;
      if (targetDepth + subtreeDepth > 3) {
        throw new ApiError(422, 'MAX_DEPTH_EXCEEDED', 'Kedalaman struktur tugas maksimal 3 level.');
      }

      const siblings = allTasks
        .filter((item) => item.parentId === targetParentId && item.id !== task.id)
        .sort((a, b) => a.position - b.position);
      const index = Math.max(0, Math.min(body.position, siblings.length));
      siblings.splice(index, 0, { ...task, parentId: targetParentId });

      await tx.task.update({ where: { id: task.id }, data: { parentId: targetParentId } });
      for (let position = 0; position < siblings.length; position += 1) {
        await tx.task.update({
          where: { id: siblings[position].id },
          data: { position },
        });
      }

      return recomputeProjectSchedule(tx, projectId);
    });

    res.json({ tasks });
  }),
);

tasksRouter.post(
  '/:id/dependencies',
  validateBody(dependencyCreateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const successor = await getOwnedTask(ownerId, req.params.id);
    const body = req.body as { predecessorId: string; type?: 'FS' | 'SS'; lagDays?: number };

    if (body.predecessorId === successor.id) {
      throw new ApiError(422, 'SELF_DEPENDENCY', 'Tugas tidak boleh bergantung pada dirinya sendiri.');
    }

    const successorChildCount = await prisma.task.count({ where: { parentId: successor.id } });
    if (successorChildCount > 0) {
      throw new ApiError(
        422,
        'NON_LEAF_DEPENDENCY',
        'Dependensi hanya boleh melibatkan tugas daun (tanpa sub-tugas).',
      );
    }

    const predecessor = await prisma.task.findFirst({
      where: { id: body.predecessorId, projectId: successor.projectId },
    });
    if (!predecessor) {
      throw new ApiError(422, 'INVALID_DEPENDENCY', 'Tugas pendahulu tidak ditemukan pada proyek ini.');
    }
    const predecessorChildCount = await prisma.task.count({ where: { parentId: predecessor.id } });
    if (predecessorChildCount > 0) {
      throw new ApiError(
        422,
        'NON_LEAF_DEPENDENCY',
        'Dependensi hanya boleh melibatkan tugas daun (tanpa sub-tugas).',
      );
    }

    const existing = await prisma.dependency.findFirst({
      where: { predecessorId: predecessor.id, successorId: successor.id },
    });
    if (existing) {
      throw new ApiError(422, 'DUPLICATE_DEPENDENCY', 'Dependensi antara kedua tugas tersebut sudah ada.');
    }

    const projectDependencies = await prisma.dependency.findMany({
      where: { predecessor: { projectId: successor.projectId } },
    });
    if (
      wouldCreateCycle(
        projectDependencies.map((dependency) => ({
          id: dependency.id,
          predecessorId: dependency.predecessorId,
          successorId: dependency.successorId,
          type: dependency.type as 'FS' | 'SS',
          lagDays: dependency.lagDays,
        })),
        predecessor.id,
        successor.id,
      )
    ) {
      throw new ApiError(
        422,
        'CYCLE_DETECTED',
        'Dependensi ini membentuk siklus. Periksa kembali urutan tugas.',
      );
    }

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.dependency.create({
        data: {
          predecessorId: predecessor.id,
          successorId: successor.id,
          type: body.type ?? 'FS',
          lagDays: body.lagDays ?? 0,
        },
      });
      return recomputeProjectSchedule(tx, successor.projectId);
    });

    res.status(201).json({ tasks });
  }),
);

tasksRouter.post(
  '/:id/assignments',
  validateBody(assignmentCreateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const task = await getOwnedTask(ownerId, req.params.id);
    const body = req.body as { resourceId: string; allocationPercent?: number };

    const childCount = await prisma.task.count({ where: { parentId: task.id } });
    if (childCount > 0) {
      throw new ApiError(
        422,
        'NON_LEAF_ASSIGNMENT',
        'Alokasi anggota hanya boleh diberikan kepada tugas daun.',
      );
    }

    const resource = await prisma.resource.findFirst({
      where: { id: body.resourceId, projectId: task.projectId },
    });
    if (!resource) {
      throw new ApiError(422, 'INVALID_RESOURCE', 'Anggota tidak ditemukan pada proyek ini.');
    }

    const existing = await prisma.assignment.findFirst({
      where: { taskId: task.id, resourceId: resource.id },
    });
    if (existing) {
      throw new ApiError(409, 'ASSIGNMENT_EXISTS', 'Anggota tersebut sudah dialokasikan pada tugas ini.');
    }

    const assignment = await prisma.assignment.create({
      data: {
        taskId: task.id,
        resourceId: resource.id,
        allocationPercent: body.allocationPercent ?? 100,
      },
    });

    res.status(201).json({
      assignment: serializeAssignment(assignment),
      tasks: await currentTasks(task.projectId),
    });
  }),
);
