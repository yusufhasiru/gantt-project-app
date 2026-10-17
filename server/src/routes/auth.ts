import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { loginSchema, registerSchema } from '@gantt/shared';
import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { requireAuth, signToken, userId } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const authRouter = Router();

export function serializeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body as {
      name: string;
      email: string;
      password: string;
    };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Email sudah terdaftar. Silakan login.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });

    res.status(201).json({ token: signToken(user.id, user.email), user: serializeUser(user) });
  }),
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await prisma.user.findUnique({ where: { email } });
    const genericError = new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Email atau password salah.',
    );

    if (!user) throw genericError;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw genericError;

    res.json({ token: signToken(user.id, user.email), user: serializeUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const user = await prisma.user.findUnique({ where: { id: userId(res) } });
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sesi tidak valid.');
    res.json({ user: serializeUser(user) });
  }),
);
