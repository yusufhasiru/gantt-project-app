import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { DomainError } from '@gantt/shared';
import { config } from '../config.js';
import { ApiError } from '../http.js';

const DOMAIN_STATUS: Record<string, number> = {
  CYCLE_DETECTED: 422,
  SELF_DEPENDENCY: 422,
  DUPLICATE_DEPENDENCY: 422,
  NON_LEAF_DEPENDENCY: 422,
  INVALID_DEPENDENCY: 422,
  INVALID_DEPENDENCY_TYPE: 422,
  INVALID_LAG: 422,
  INVALID_STRUCTURE: 422,
  MAX_DEPTH_EXCEEDED: 422,
  INVALID_TASK_DURATION: 422,
  INVALID_TASK_PROGRESS: 422,
  INVALID_CALENDAR: 422,
  INVALID_DATE: 400,
  INVALID_SHIFT: 422,
  SCHEDULING_ERROR: 422,
  CPM_ERROR: 422,
};

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details ?? {} },
    });
    return;
  }

  if (error instanceof DomainError) {
    res.status(DOMAIN_STATUS[error.code] ?? 422).json({
      error: { code: error.code, message: error.message, details: error.details ?? {} },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Data yang dikirim tidak valid.',
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'UNIQUE_CONFLICT',
          message: 'Data dengan nilai tersebut sudah ada.',
          details: {},
        },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Sumber daya tidak ditemukan.', details: {} },
      });
      return;
    }
    if (error.code === 'P2003') {
      res.status(409).json({
        error: {
          code: 'RELATION_CONFLICT',
          message: 'Operasi melanggar relasi data yang ada.',
          details: {},
        },
      });
      return;
    }
  }

  if (error instanceof SyntaxError && 'status' in error && (error as { status?: number }).status === 400) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Body request bukan JSON yang valid.', details: {} },
    });
    return;
  }

  if (!config.isTest) {
    console.error('[server] Kesalahan internal:', error);
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan pada server. Silakan coba lagi.',
      details: {},
    },
  });
}
