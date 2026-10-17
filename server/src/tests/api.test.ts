import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../db.js';

const app = createApp();
const PASSWORD = 'Password123';

async function resetDatabase() {
  await prisma.assignment.deleteMany();
  await prisma.dependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function register(name: string, email: string): Promise<{ token: string; userId: string }> {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: PASSWORD });
  expect(response.status).toBe(201);
  return { token: response.body.token as string, userId: response.body.user.id as string };
}

async function createProject(token: string, overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/projects')
    .set(auth(token))
    .send({ name: 'Proyek Uji', startDate: '2026-10-19', ...overrides });
  expect(response.status).toBe(201);
  return response.body;
}

async function createTask(
  token: string,
  projectId: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app)
    .post(`/api/projects/${projectId}/tasks`)
    .set(auth(token))
    .send({
      name: 'Tugas',
      durationDays: 2,
      startDate: '2026-10-19',
      ...overrides,
    });
  expect(response.status).toBe(201);
  return response.body.tasks as Array<Record<string, unknown>>;
}

function findTask(tasks: Array<Record<string, unknown>>, name: string) {
  const task = tasks.find((item) => item.name === name);
  expect(task).toBeDefined();
  return task as Record<string, unknown>;
}

describe('health dan autentikasi', () => {
  it('GET /api/health merespons ok', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('registrasi menyimpan password sebagai hash dan tidak mengembalikannya', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Siti', email: 'siti@example.com', password: PASSWORD });
    expect(response.status).toBe(201);
    expect(response.body.token).toBeTypeOf('string');
    expect(response.body.user.passwordHash).toBeUndefined();

    const stored = await prisma.user.findUnique({ where: { email: 'siti@example.com' } });
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe(PASSWORD);
  });

  it('menolak email duplikat dan input registrasi tidak valid', async () => {
    await register('Siti', 'siti@example.com');
    const duplicate = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Siti Lain', email: 'siti@example.com', password: PASSWORD });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');

    const invalid = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'bukan-email', password: 'pendek' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('menolak token kedaluwarsa', async () => {
    const expired = jwt.sign(
      { sub: 'user-tidak-ada', email: 'kedaluwarsa@example.com' },
      process.env.JWT_SECRET as string,
      { expiresIn: '-1s' },
    );
    const response = await request(app).get('/api/auth/me').set(auth(expired));
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('login berhasil, password salah generik, dan token invalid ditolak', async () => {
    await register('Siti', 'siti@example.com');

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'siti@example.com', password: PASSWORD });
    expect(ok.status).toBe(200);

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'siti@example.com', password: 'SalahBanget123' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('Email atau password salah.');

    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tidakada@example.com', password: PASSWORD });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set(auth('token-palsu'))).status,
    ).toBe(401);

    const me = await request(app).get('/api/auth/me').set(auth(ok.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('siti@example.com');
  });
});

describe('proyek dan kepemilikan', () => {
  it('CRUD proyek berfungsi dan data bertahan di database', async () => {
    const { token } = await register('Siti', 'siti@example.com');
    const snapshot = await createProject(token, { description: 'Deskripsi' });

    expect(snapshot.project.name).toBe('Proyek Uji');
    expect(snapshot.project.weekendDays).toEqual([0, 6]);
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.metrics.totalCost).toBe(0);

    const list = await request(app).get('/api/projects').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.projects).toHaveLength(1);
    expect(list.body.projects[0].metrics.taskCount).toBe(0);

    const updated = await request(app)
      .patch(`/api/projects/${snapshot.project.id}`)
      .set(auth(token))
      .send({ name: 'Proyek Diubah', startDate: '2026-10-20' });
    expect(updated.status).toBe(200);
    expect(updated.body.project.name).toBe('Proyek Diubah');
    expect(updated.body.project.startDate).toBe('2026-10-20');

    const removed = await request(app)
      .delete(`/api/projects/${snapshot.project.id}`)
      .set(auth(token));
    expect(removed.status).toBe(204);
    expect(await prisma.project.count()).toBe(0);
  });

  it('menolak akses proyek, tugas, dan resource milik pengguna lain dengan 404', async () => {
    const owner = await register('Owner', 'owner@example.com');
    const intruder = await register('Intruder', 'intruder@example.com');
    const snapshot = await createProject(owner.token);
    const projectId = snapshot.project.id as string;

    expect((await request(app).get(`/api/projects/${projectId}`).set(auth(intruder.token))).status).toBe(404);
    expect(
      (await request(app).patch(`/api/projects/${projectId}`).set(auth(intruder.token)).send({ name: 'Hack' })).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/projects/${projectId}`).set(auth(intruder.token))).status).toBe(404);

    const tasks = await createTask(owner.token, projectId, { name: 'Rahasia' });
    const taskId = tasks[0].id as string;
    expect(
      (await request(app).patch(`/api/tasks/${taskId}`).set(auth(intruder.token)).send({ name: 'Hack' })).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/tasks/${taskId}`).set(auth(intruder.token))).status).toBe(404);

    const resource = await request(app)
      .post(`/api/projects/${projectId}/resources`)
      .set(auth(owner.token))
      .send({ name: 'Andi', email: 'andi@example.com', role: 'PM', salary: 1000 });
    expect(resource.status).toBe(201);
    expect(
      (await request(app).patch(`/api/resources/${resource.body.resource.id}`).set(auth(intruder.token)).send({ salary: 1 })).status,
    ).toBe(404);

    expect((await request(app).get('/api/projects').set(auth(intruder.token))).body.projects).toHaveLength(0);
  });
});

describe('tugas, dependensi, dan penjadwalan', () => {
  it('membuat tugas dan menjadwalkan FS berdasarkan kalender kerja', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    let tasks = await createTask(token, projectId, {
      name: 'A',
      durationDays: 3,
      startDate: '2026-10-23',
    });
    const a = findTask(tasks, 'A');
    expect(a.scheduledStart).toBe('2026-10-23');
    expect(a.scheduledEnd).toBe('2026-10-27');

    tasks = await createTask(token, projectId, { name: 'B', durationDays: 2, startDate: '2026-10-19' });
    const b = findTask(tasks, 'B');
    const dependency = await request(app)
      .post(`/api/tasks/${b.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: a.id, type: 'FS', lagDays: 0 });
    expect(dependency.status).toBe(201);
    const scheduledB = findTask(dependency.body.tasks, 'B');
    expect(scheduledB.scheduledStart).toBe('2026-10-28');
    expect(scheduledB.scheduledEnd).toBe('2026-10-29');
  });

  it('SS lag dan perubahan kalender memicu penjadwalan ulang', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    let tasks = await createTask(token, projectId, { name: 'A', durationDays: 3, startDate: '2026-10-23' });
    const a = findTask(tasks, 'A');
    tasks = await createTask(token, projectId, { name: 'B', durationDays: 2, startDate: '2026-10-19' });
    const b = findTask(tasks, 'B');

    const dependency = await request(app)
      .post(`/api/tasks/${b.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: a.id, type: 'SS', lagDays: 2 });
    expect(dependency.status).toBe(201);
    expect(findTask(dependency.body.tasks, 'B').scheduledStart).toBe('2026-10-27');

    const holiday = await request(app)
      .post(`/api/projects/${projectId}/holidays`)
      .set(auth(token))
      .send({ date: '2026-10-26', name: 'Libur' });
    expect(holiday.status).toBe(201);
    const afterHoliday = findTask(holiday.body.tasks, 'A');
    expect(afterHoliday.scheduledEnd).toBe('2026-10-28');
    const ssAfter = findTask(holiday.body.tasks, 'B');
    // SS lag 2 dari Jumat 23 Okt: hari kerja berikutnya adalah Selasa 27 Okt
    // (Senin 26 Okt libur), lalu Rabu 28 Okt.
    expect(ssAfter.scheduledStart).toBe('2026-10-28');

    const conflict = await request(app)
      .post(`/api/projects/${projectId}/holidays`)
      .set(auth(token))
      .send({ date: '2026-10-26', name: 'Libur lagi' });
    expect(conflict.status).toBe(409);

    const weekendChange = await request(app)
      .put(`/api/projects/${projectId}/calendar`)
      .set(auth(token))
      .send({ weekendDays: [5, 6] });
    expect(weekendChange.status).toBe(200);
    // Akhir pekan kini Jumat/Sabtu: Jumat 23 Okt bukan hari kerja, Minggu 25 Okt hari kerja,
    // Senin 26 Okt tetap libur, sehingga A berjalan 25-28 Okt.
    const weekendA = findTask(weekendChange.body.tasks, 'A');
    expect(weekendA.scheduledStart).toBe('2026-10-25');
    expect(weekendA.scheduledEnd).toBe('2026-10-28');
    expect(findTask(weekendChange.body.tasks, 'B').scheduledStart).toBe('2026-10-28');

    const invalidCalendar = await request(app)
      .put(`/api/projects/${projectId}/calendar`)
      .set(auth(token))
      .send({ weekendDays: [0, 1, 2, 3, 4, 5, 6] });
    expect(invalidCalendar.status).toBe(400);
  });

  it('menolak siklus, dependensi duplikat, diri sendiri, dan tugas induk', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    let tasks = await createTask(token, projectId, { name: 'A' });
    const a = findTask(tasks, 'A');
    tasks = await createTask(token, projectId, { name: 'B' });
    const b = findTask(tasks, 'B');

    const self = await request(app)
      .post(`/api/tasks/${a.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: a.id });
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe('SELF_DEPENDENCY');

    const first = await request(app)
      .post(`/api/tasks/${b.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: a.id });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post(`/api/tasks/${b.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: a.id, type: 'SS' });
    expect(duplicate.body.error.code).toBe('DUPLICATE_DEPENDENCY');

    const cycle = await request(app)
      .post(`/api/tasks/${a.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: b.id });
    expect(cycle.status).toBe(422);
    expect(cycle.body.error.code).toBe('CYCLE_DETECTED');

    // Struktur induk dengan anak
    const parentTasks = await createTask(token, projectId, { name: 'Parent', durationDays: 1 });
    const parent = findTask(parentTasks, 'Parent');
    const childTasks = await createTask(token, projectId, { name: 'Child', parentId: parent.id });
    const child = findTask(childTasks, 'Child');

    const parentDependency = await request(app)
      .post(`/api/tasks/${parent.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: a.id });
    expect(parentDependency.status).toBe(422);
    expect(parentDependency.body.error.code).toBe('NON_LEAF_DEPENDENCY');

    const parentChildDependency = await request(app)
      .post(`/api/tasks/${child.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: parent.id });
    expect(parentChildDependency.status).toBe(422);

    const addChildToDependent = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(auth(token))
      .send({ name: 'Anak baru', durationDays: 1, startDate: '2026-10-19', parentId: a.id });
    expect(addChildToDependent.status).toBe(409);
    expect(addChildToDependent.body.error.code).toBe('PARENT_HAS_RELATIONS');
  });

  it('membatasi kedalaman tiga level dan menghitung summary task otomatis', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    let tasks = await createTask(token, projectId, { name: 'L1', durationDays: 1 });
    const l1 = findTask(tasks, 'L1');
    tasks = await createTask(token, projectId, { name: 'L2', parentId: l1.id });
    const l2 = findTask(tasks, 'L2');
    tasks = await createTask(token, projectId, { name: 'L3', parentId: l2.id, durationDays: 4 });
    const l3 = findTask(tasks, 'L3');

    const tooDeep = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(auth(token))
      .send({ name: 'L4', durationDays: 1, startDate: '2026-10-19', parentId: l3.id });
    expect(tooDeep.status).toBe(422);
    expect(tooDeep.body.error.code).toBe('MAX_DEPTH_EXCEEDED');

    const current = await request(app).get(`/api/projects/${projectId}`).set(auth(token));
    const summary = findTask(current.body.tasks, 'L1');
    expect(summary.scheduledStart).toBe(findTask(current.body.tasks, 'L3').scheduledStart);
    expect(summary.scheduledEnd).toBe(findTask(current.body.tasks, 'L3').scheduledEnd);

    const patchSummary = await request(app)
      .patch(`/api/tasks/${l1.id}`)
      .set(auth(token))
      .send({ durationDays: 10 });
    expect(patchSummary.status).toBe(422);
    expect(patchSummary.body.error.code).toBe('SUMMARY_TASK_READ_ONLY');

    const progressChild = await request(app)
      .patch(`/api/tasks/${l3.id}`)
      .set(auth(token))
      .send({ progress: 50 });
    expect(progressChild.status).toBe(200);
    expect(findTask(progressChild.body.tasks, 'L1').progress).toBe(50);
  });

  it('menghapus tugas beserta anak, dependensi, dan alokasinya', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;
    const resource = await request(app)
      .post(`/api/projects/${projectId}/resources`)
      .set(auth(token))
      .send({ name: 'Andi', email: 'andi@example.com', role: 'PM', salary: 2_200_000 });

    let tasks = await createTask(token, projectId, { name: 'Parent' });
    const parent = findTask(tasks, 'Parent');
    tasks = await createTask(token, projectId, { name: 'Child', parentId: parent.id });
    const child = findTask(tasks, 'Child');

    await request(app)
      .post(`/api/tasks/${child.id}/assignments`)
      .set(auth(token))
      .send({ resourceId: resource.body.resource.id, allocationPercent: 50 });

    const second = await createTask(token, projectId, { name: 'Lain', durationDays: 1 });
    const otherTask = findTask(second, 'Lain');
    await request(app)
      .post(`/api/tasks/${otherTask.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: child.id });

    const deleted = await request(app).delete(`/api/tasks/${parent.id}`).set(auth(token));
    expect(deleted.status).toBe(200);
    expect(await prisma.task.count({ where: { projectId } })).toBe(1);
    expect(await prisma.dependency.count()).toBe(0);
    expect(await prisma.assignment.count()).toBe(0);
  });

  it('memindahkan tugas mengubah urutan dan induk', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    let tasks = await createTask(token, projectId, { name: 'A' });
    const a = findTask(tasks, 'A');
    tasks = await createTask(token, projectId, { name: 'B' });
    const b = findTask(tasks, 'B');

    const moved = await request(app)
      .post(`/api/tasks/${b.id}/move`)
      .set(auth(token))
      .send({ parentId: a.id, position: 0 });
    expect(moved.status).toBe(200);
    const movedTask = findTask(moved.body.tasks, 'B');
    expect(movedTask.parentId).toBe(a.id);
    expect(movedTask.position).toBe(0);
    expect(findTask(moved.body.tasks, 'A').scheduledStart).toBe(movedTask.scheduledStart);

    const invalid = await request(app)
      .post(`/api/tasks/${a.id}/move`)
      .set(auth(token))
      .send({ parentId: b.id, position: 0 });
    expect(invalid.status).toBe(422);
  });
});

describe('hari libur', () => {
  it('menghapus hari libur dengan autentikasi dan menghitung ulang jadwal', async () => {
    const owner = await register('Owner', 'owner@example.com');
    const intruder = await register('Intruder', 'intruder@example.com');
    const snapshot = await createProject(owner.token);
    const projectId = snapshot.project.id as string;
    await createTask(owner.token, projectId, {
      name: 'A',
      durationDays: 3,
      startDate: '2026-10-23',
    });

    const added = await request(app)
      .post(`/api/projects/${projectId}/holidays`)
      .set(auth(owner.token))
      .send({ date: '2026-10-26', name: 'Libur' });
    expect(added.status).toBe(201);
    expect(findTask(added.body.tasks, 'A').scheduledEnd).toBe('2026-10-28');
    const holidayId = added.body.project.holidays[0].id as string;

    // Tanpa token harus 401 (regresi: route ini pernah tidak memakai requireAuth).
    expect((await request(app).delete(`/api/holidays/${holidayId}`)).status).toBe(401);
    expect(
      (await request(app).delete(`/api/holidays/${holidayId}`).set(auth(intruder.token))).status,
    ).toBe(404);

    const removed = await request(app)
      .delete(`/api/holidays/${holidayId}`)
      .set(auth(owner.token));
    expect(removed.status).toBe(200);
    expect(findTask(removed.body.tasks, 'A').scheduledEnd).toBe('2026-10-27');
    expect(await prisma.holiday.count()).toBe(0);
  });
});

describe('resource, biaya, dan analisis', () => {
  it('mengelola resource dan assignment serta menghitung biaya dan over-alokasi', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    const andi = await request(app)
      .post(`/api/projects/${projectId}/resources`)
      .set(auth(token))
      .send({ name: 'Andi', email: 'andi@example.com', role: 'PM', salary: 22_000_000 });
    expect(andi.status).toBe(201);

    const tasks = await createTask(token, projectId, { name: 'A', durationDays: 10 });
    const a = findTask(tasks, 'A');

    const assignment = await request(app)
      .post(`/api/tasks/${a.id}/assignments`)
      .set(auth(token))
      .send({ resourceId: andi.body.resource.id, allocationPercent: 100 });
    expect(assignment.status).toBe(201);

    const duplicate = await request(app)
      .post(`/api/tasks/${a.id}/assignments`)
      .set(auth(token))
      .send({ resourceId: andi.body.resource.id });
    expect(duplicate.status).toBe(409);

    const analysis = await request(app).get(`/api/projects/${projectId}/analysis`).set(auth(token));
    expect(analysis.status).toBe(200);
    expect(analysis.body.cost.total).toBe(10_000_000);
    expect(analysis.body.metrics.totalCost).toBe(10_000_000);

    const updated = await request(app)
      .patch(`/api/assignments/${assignment.body.assignment.id}`)
      .set(auth(token))
      .send({ allocationPercent: 50 });
    expect(updated.status).toBe(200);
    expect(updated.body.assignment.allocationPercent).toBe(50);

    const removed = await request(app)
      .delete(`/api/assignments/${assignment.body.assignment.id}`)
      .set(auth(token));
    expect(removed.status).toBe(204);
  });

  it('analisis CPM memenuhi vektor wajib dan PERT tersedia saat data lengkap', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    let tasks = await createTask(token, projectId, { name: 'A', durationDays: 3 });
    const a = findTask(tasks, 'A');
    tasks = await createTask(token, projectId, { name: 'B', durationDays: 2 });
    const b = findTask(tasks, 'B');
    tasks = await createTask(token, projectId, { name: 'C', durationDays: 5 });
    const c = findTask(tasks, 'C');
    tasks = await createTask(token, projectId, {
      name: 'D',
      durationDays: 1,
      optimisticDays: 1,
      pessimisticDays: 2,
    });
    const d = findTask(tasks, 'D');

    for (const [successor, predecessor] of [
      [b, a],
      [c, a],
      [d, b],
      [d, c],
    ] as const) {
      const response = await request(app)
        .post(`/api/tasks/${successor.id}/dependencies`)
        .set(auth(token))
        .send({ predecessorId: predecessor.id, type: 'FS', lagDays: 0 });
      expect(response.status).toBe(201);
    }

    const analysis = await request(app).get(`/api/projects/${projectId}/analysis`).set(auth(token));
    expect(analysis.status).toBe(200);
    expect(analysis.body.cpm.projectEndOrdinal).toBe(8);
    const rows = Object.fromEntries(
      (analysis.body.cpm.tasks as Array<Record<string, unknown>>).map((row) => [row.id, row]),
    );
    expect(rows[a.id]).toMatchObject({ es: 0, ef: 2, totalFloat: 0, critical: true });
    expect(rows[b.id]).toMatchObject({ es: 3, ef: 4, totalFloat: 3, critical: false });
    expect(rows[c.id]).toMatchObject({ es: 3, ef: 7, totalFloat: 0, critical: true });
    expect(rows[d.id]).toMatchObject({ es: 8, ef: 8, totalFloat: 0, critical: true });
    expect(analysis.body.cpm.criticalPaths).toEqual([[a.id, c.id, d.id]]);

    // PERT: jalur kritis A, C, D. Hanya D memiliki estimasi lengkap sehingga
    // nilai proyek tidak boleh ditampilkan sebagai angka palsu.
    expect(analysis.body.pert.available).toBe(false);
    expect(analysis.body.pert.projectExpectedDays).toBeNull();
    expect(analysis.body.pert.estimates.some((estimate: { id: string }) => estimate.id === d.id)).toBe(true);
  });

  it('menghitung PERT proyek saat semua tugas kritis memiliki estimasi', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;

    const tasks = await createTask(token, projectId, {
      name: 'Sendiri',
      durationDays: 10,
      optimisticDays: 8,
      pessimisticDays: 15,
    });
    const task = findTask(tasks, 'Sendiri');
    const analysis = await request(app).get(`/api/projects/${projectId}/analysis`).set(auth(token));
    expect(analysis.body.pert.available).toBe(true);
    expect(analysis.body.pert.projectExpectedDays).toBeCloseTo((8 + 40 + 15) / 6, 6);
    expect(analysis.body.pert.projectVariance).toBeCloseTo(Math.pow(7 / 6, 2), 6);
    expect(task.critical ?? true).toBeTruthy();
  });
});

describe('integritas, error, dan cascade', () => {
  it('menghapus proyek beserta seluruh data turunannya', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;
    const resource = await request(app)
      .post(`/api/projects/${projectId}/resources`)
      .set(auth(token))
      .send({ name: 'Andi', email: 'andi@example.com', role: 'PM', salary: 1_000_000 });

    let tasks = await createTask(token, projectId, { name: 'A' });
    const a = findTask(tasks, 'A');
    tasks = await createTask(token, projectId, { name: 'B' });
    const b = findTask(tasks, 'B');
    await request(app)
      .post(`/api/tasks/${b.id}/dependencies`)
      .set(auth(token))
      .send({ predecessorId: a.id });
    await request(app)
      .post(`/api/tasks/${a.id}/assignments`)
      .set(auth(token))
      .send({ resourceId: resource.body.resource.id });
    await request(app)
      .post(`/api/projects/${projectId}/holidays`)
      .set(auth(token))
      .send({ date: '2026-11-11', name: 'Libur' });

    expect((await request(app).delete(`/api/projects/${projectId}`).set(auth(token))).status).toBe(204);
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.dependency.count()).toBe(0);
    expect(await prisma.resource.count()).toBe(0);
    expect(await prisma.assignment.count()).toBe(0);
    expect(await prisma.holiday.count()).toBe(0);
  });

  it('membatalkan seluruh perubahan jika penjadwalan ulang gagal di dalam transaksi', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const snapshot = await createProject(token);
    const projectId = snapshot.project.id as string;
    let tasks = await createTask(token, projectId, { name: 'A' });
    const a = findTask(tasks, 'A');
    tasks = await createTask(token, projectId, { name: 'B' });
    const b = findTask(tasks, 'B');

    // Membuat siklus langsung di database (melewati validasi API) untuk memaksa
    // recompute gagal setelah update nama berada di dalam transaksi yang sama.
    await prisma.dependency.create({
      data: { predecessorId: a.id as string, successorId: b.id as string, type: 'FS', lagDays: 0 },
    });
    await prisma.dependency.create({
      data: { predecessorId: b.id as string, successorId: a.id as string, type: 'FS', lagDays: 0 },
    });

    const response = await request(app)
      .patch(`/api/tasks/${a.id}`)
      .set(auth(token))
      .send({ name: 'A berubah' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CYCLE_DETECTED');

    const stored = await prisma.task.findUnique({ where: { id: a.id as string } });
    expect(stored?.name).toBe('A');
  });

  it('menolak JSON invalid dan mengembalikan format error konsisten', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const response = await request(app)
      .post('/api/projects')
      .set(auth(token))
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');

    const notFound = await request(app).get('/api/projects/tidak-ada').set(auth(token));
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('menolak resource lintas proyek dan assignment pada summary task', async () => {
    const { token } = await register('PM', 'pm@example.com');
    const first = await createProject(token, { name: 'Pertama' });
    const second = await createProject(token, { name: 'Kedua' });
    const resource = await request(app)
      .post(`/api/projects/${first.project.id}/resources`)
      .set(auth(token))
      .send({ name: 'Andi', email: 'andi@example.com', role: 'PM', salary: 1_000_000 });

    const tasks = await createTask(token, second.project.id, { name: 'A' });
    const task = findTask(tasks, 'A');
    const crossProject = await request(app)
      .post(`/api/tasks/${task.id}/assignments`)
      .set(auth(token))
      .send({ resourceId: resource.body.resource.id });
    expect(crossProject.status).toBe(422);

    const parentTasks = await createTask(token, second.project.id, { name: 'Parent' });
    const parent = findTask(parentTasks, 'Parent');
    await createTask(token, second.project.id, { name: 'Child', parentId: parent.id });
    const summaryAssignment = await request(app)
      .post(`/api/tasks/${parent.id}/assignments`)
      .set(auth(token))
      .send({ resourceId: resource.body.resource.id });
    expect(summaryAssignment.status).toBe(422);
    expect(summaryAssignment.body.error.code).toBe('NON_LEAF_ASSIGNMENT');
  });

  it('menolak akses tanpa autentikasi pada seluruh endpoint proyek', async () => {
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/tasks/x')).status).toBe(401);
    expect((await request(app).post('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects/x/analysis')).status).toBe(401);
  });
});
