import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../http.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { getOwnedHoliday, serializeProject } from '../services/access.js';
import { recomputeProjectSchedule } from '../services/recompute.js';

export const calendarRouter = Router();

calendarRouter.use(requireAuth);

calendarRouter.delete(
  '/holidays/:id',
  asyncHandler(async (req, res) => {
    const ownerId = userId(res);
    const holiday = await getOwnedHoliday(ownerId, req.params.id);
    const projectId = holiday.projectId;

    const tasks = await prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id: holiday.id } });
      return recomputeProjectSchedule(tx, projectId);
    });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { holidays: { orderBy: { date: 'asc' } } },
    });

    res.json({ project: project ? serializeProject(project) : null, tasks });
  }),
);
