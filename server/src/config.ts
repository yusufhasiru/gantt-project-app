import 'dotenv/config';

const WEAK_SECRET_VALUES = new Set([
  'secret',
  'jwt_secret',
  'changeme',
  'development',
  'ganti-dengan-secret-acak-panjang',
  'ganti-dengan-secret-acak-panjang-minimal-32-karakter',
]);

function readJwtSecret(): string {
  const value = process.env.JWT_SECRET ?? '';
  if (!value.trim()) {
    throw new Error(
      'JWT_SECRET kosong. Isi server/.env dengan secret acak minimal 32 karakter (contoh: openssl rand -hex 32).',
    );
  }
  if (value.trim().length < 32) {
    throw new Error('JWT_SECRET terlalu pendek (minimal 32 karakter). Gunakan nilai acak yang aman.');
  }
  if (WEAK_SECRET_VALUES.has(value.trim().toLowerCase())) {
    throw new Error('JWT_SECRET masih memakai nilai contoh yang tidak aman. Ganti dengan secret acak.');
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  nodeEnv,
  isTest: nodeEnv === 'test',
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: readJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
