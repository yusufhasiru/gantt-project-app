import { Router } from 'express';
import { dependencyUpdateSchema } from '@gantt/shared';
import { prisma } from '../db.js';
import { asyncHandler } from '../http.js';
import { userId } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getOwnedDependency } from '../services/access.js';
import { recomputeProjectSchedule } from '../services/recompute.js';

export const dependenciesRouter = Router();

dependenciesRouter.patch(
  '/:id',
  validateBody(dependencyUpdateSchema),
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const dependency = await getOwnedDependency(ownerId, req.params.id);
    const body = req.body as { type?: 'FS' | 'SS'; lagDays?: number };
    const projectId = dependency.successor.projectId;

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.dependency.update({
        where: { id: dependency.id },
        data: {
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.lagDays !== undefined ? { lagDays: body.lagDays } : {}),
        },
      });
      return recomputeProjectSchedule(tx, projectId);
    });

    res.json({ tasks });
  }),
);

dependenciesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const dependency = await getOwnedDependency(ownerId, req.params.id);
    const projectId = dependency.successor.projectId;

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.dependency.delete({ where: { id: dependency.id } });
      return recomputeProjectSchedule(tx, projectId);
    });

    res.json({ tasks });
  }),
);
