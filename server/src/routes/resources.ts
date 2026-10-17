import { Router } from 'express';
import {
  assignmentUpdateSchema,
  resourceUpdateSchema,
} from '@gantt/shared';
import { prisma } from '../db.js';
import { asyncHandler } from '../http.js';
import { userId } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  getOwnedAssignment,
  getOwnedResource,
  serializeResource,
} from '../services/access.js';
import { recomputeProjectSchedule } from '../services/recompute.js';

export const resourcesRouter = Router();
export const assignmentsRouter = Router();

resourcesRouter.patch(
  '/:id',
  validateBody(resourceUpdateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const resource = await getOwnedResource(ownerId, req.params.id);
    const body = req.body as { name?: string; email?: string; role?: string; salary?: number };

    const updated = await prisma.resource.update({
      where: { id: resource.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.salary !== undefined ? { salary: body.salary } : {}),
      },
    });

    res.json({ resource: serializeResource(updated) });
  }),
);

resourcesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const resource = await getOwnedResource(ownerId, req.params.id);
    await prisma.resource.delete({ where: { id: resource.id } });
    const tasks = await prisma.$transaction((tx) =>
      recomputeProjectSchedule(tx, resource.projectId),
    );
    res.json({ tasks });
  }),
);

assignmentsRouter.patch(
  '/:id',
  validateBody(assignmentUpdateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const assignment = await getOwnedAssignment(ownerId, req.params.id);
    const body = req.body as { allocationPercent: number };

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: { allocationPercent: body.allocationPercent },
    });

    res.json({
      assignment: {
        id: updated.id,
        taskId: updated.taskId,
        resourceId: updated.resourceId,
        allocationPercent: updated.allocationPercent,
      },
    });
  }),
);

assignmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const assignment = await getOwnedAssignment(ownerId, req.params.id);
    await prisma.assignment.delete({ where: { id: assignment.id } });
    res.status(204).end();
  }),
);
