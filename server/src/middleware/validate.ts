import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../http.js';

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(
        new ApiError(400, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid.', {
          issues: details,
        }),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
