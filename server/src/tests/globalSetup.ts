import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export default function setup() {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  execFileSync('npx', ['prisma', 'db', 'push', '--force-reset', '--skip-generate'], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
