import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from '../http.js';

export interface AuthPayload {
  sub: string;
  email: string;
}

export function signToken(userId: string, email: string): string {
  const payload: AuthPayload = { sub: userId, email };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Anda harus login terlebih dahulu.'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as Partial<AuthPayload>;
    if (!decoded.sub) throw new Error('Token tidak memiliki subjek.');
    res.locals.userId = decoded.sub;
    next();
  } catch {
    next(new ApiError(401, 'INVALID_TOKEN', 'Sesi tidak valid atau sudah kedaluwarsa.'));
  }
}

export function userId(res: Response): string {
  const value = res.locals.userId as string | undefined;
  if (!value) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Anda harus login terlebih dahulu.');
  }
  return value;
}
