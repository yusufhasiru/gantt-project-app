import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { prisma } from './db.js';
import { asyncHandler } from './http.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { dependenciesRouter } from './routes/dependencies.js';
import { resourcesRouter, assignmentsRouter } from './routes/resources.js';
import { calendarRouter } from './routes/calendar.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin tidak diizinkan oleh CORS.'));
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 10_000 : 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
        details: {},
      },
    },
  });

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    }),
  );

  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth', authRouter);

  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', requireAuth, tasksRouter);
  app.use('/api/dependencies', requireAuth, dependenciesRouter);
  app.use('/api/resources', requireAuth, resourcesRouter);
  app.use('/api/assignments', requireAuth, assignmentsRouter);
  app.use('/api', calendarRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.', details: {} },
    });
  });

  app.use(errorHandler);
  return app;
}
