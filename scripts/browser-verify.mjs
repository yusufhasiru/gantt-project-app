/**
 * Verifikasi browser GanttFlow.
 * Prasyarat: `npm run dev` berjalan (server :3001, client :5173) dan seed sudah dijalankan.
 * Menjalankan: `npm run verify:browser`
 * Menggunakan Google Chrome yang terpasang (tanpa mengunduh browser Playwright).
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const TASK_NAME = 'Verifikasi Browser';
const API = process.env.API_URL ?? 'http://localhost:3001/api';

const failures = [];
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

async function apiFromPage(path) {
  return page.evaluate(
    async ({ api, path }) => {
      const token = localStorage.getItem('ganttflow.token');
      const response = await fetch(api + path, { headers: { Authorization: `Bearer ${token}` } });
      return { status: response.status, body: await response.json() };
    },
    { api: API, path },
  );
}

async function waitToast(text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
}

async function waitForTask(projectId, taskId, predicate, timeout = 10000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    const snapshot = await apiFromPage(`/projects/${projectId}`);
    last = snapshot.body.tasks.find((task) => task.id === taskId) ?? null;
    if (last && predicate(last)) return last;
    await page.waitForTimeout(200);
  }
  return last;
}

try {
  await mkdir('docs/screenshots', { recursive: true });

  // 1. Akses tanpa login diarahkan ke halaman login
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login', { timeout: 10000 });
  check('Akses tanpa login diarahkan ke /login', page.url().includes('/login'));

  // 2. Login akun demo
  await page.getByLabel('Email').fill('demo@example.com');
  await page.getByLabel('Password').fill('Demo12345');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL('**/projects', { timeout: 15000 });
  await page.getByText('Pengembangan Aplikasi Mobile Toko Online').first().waitFor();
  check('Login demo berhasil dan dashboard tampil', true);
  await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: false });

  // 3. Buka proyek seed
  await page.getByRole('link', { name: /Buka Gantt/ }).first().click();
  await page.waitForURL('**/gantt', { timeout: 15000 });
  await page.getByTestId('gantt-timeline').waitFor();
  const projectId = page.url().split('/projects/')[1].split('/')[0];
  check('Gantt Chart proyek seed terbuka', true);
  await page.screenshot({ path: 'docs/screenshots/gantt.png', fullPage: false });

  const seededRows = await page.locator('[data-testid^="gantt-row-"]').count();
  check('Baris tugas seed tampil', seededRows >= 17, `${seededRows} baris`);

  const seedSnapshot = await apiFromPage(`/projects/${projectId}`);
  const arrowCount = await page.locator('[data-testid^="gantt-arrow-"]').count();
  check(
    'Semua panah dependensi FS dan SS dirender',
    arrowCount === seedSnapshot.body.dependencies.length,
    `${arrowCount}/${seedSnapshot.body.dependencies.length} panah`,
  );

  // 4. Buat tugas baru melalui form
  await page.getByRole('button', { name: '+ Tugas' }).click();
  const taskDialog = page.getByRole('dialog');
  await taskDialog.getByLabel(/Nama tugas/).fill(TASK_NAME);
  await taskDialog.getByLabel(/Durasi/).fill('2');
  await taskDialog.getByLabel(/Tanggal mulai paling awal/).fill('2026-10-19');
  await taskDialog.getByRole('button', { name: 'Tambah tugas' }).click();
  await waitToast('Tugas berhasil ditambahkan.');
  let createdTask = null;
  for (let attempt = 0; attempt < 30 && !createdTask; attempt += 1) {
    const snapshotAfterCreate = await apiFromPage(`/projects/${projectId}`);
    createdTask = snapshotAfterCreate.body.tasks.find((task) => task.name === TASK_NAME) ?? null;
    if (!createdTask) await page.waitForTimeout(200);
  }
  check('Tugas baru tersimpan melalui API', Boolean(createdTask), createdTask?.id ?? 'tidak ditemukan');
  const taskId = createdTask?.id;

  // 5. Tambah dependensi FS dari tugas seed
  await page.getByRole('button', { name: `Dependensi ${TASK_NAME}` }).click();
  const depDialog = page.getByRole('dialog');
  await depDialog.getByLabel('Tugas pendahulu').selectOption({ label: 'Kickoff dan kebutuhan' });
  await depDialog.getByLabel('Tipe').selectOption('FS');
  await depDialog.getByLabel('Lag (hari)').fill('0');
  await depDialog.getByRole('button', { name: 'Tambah', exact: true }).click();
  await waitToast('Dependensi ditambahkan dan jadwal diperbarui.');
  const depTask = await waitForTask(projectId, taskId, (task) => task.scheduledStart === '2026-10-22');
  check(
    'Dependensi FS menggeser mulai tugas ke 2026-10-22',
    depTask?.scheduledStart === '2026-10-22',
    depTask?.scheduledStart ?? 'kosong',
  );
  await page.keyboard.press('Escape');

  // 6. Resize bar (ujung kanan) menambah durasi
  const bar = page.getByTestId(`gantt-bar-${taskId}`);
  await bar.scrollIntoViewIfNeeded();
  const handle = bar.locator('[data-handle="resize"]');
  const handleBox = await handle.boundingBox();
  if (handleBox) {
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 150, handleBox.y + handleBox.height / 2, { steps: 16 });
    await page.mouse.up();
    await waitToast('Jadwal tugas diperbarui.');
  }
  const resized = await waitForTask(projectId, taskId, (task) => task.durationDays > 2);
  check('Resize bar menambah durasi hari kerja', (resized?.durationDays ?? 0) > 2, `durasi ${resized?.durationDays}`);

  // 7. Drag bar mengubah tanggal mulai
  const barBox = await bar.boundingBox();
  if (barBox) {
    await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(barBox.x + barBox.width / 2 + 72, barBox.y + barBox.height / 2, { steps: 14 });
    await page.mouse.up();
    await waitToast('Jadwal');
  }
  const dragged = await waitForTask(
    projectId,
    taskId,
    (task) => task.scheduledStart !== resized?.scheduledStart,
  );
  check(
    'Drag bar mengubah tanggal mulai',
    dragged?.scheduledStart !== resized?.scheduledStart,
    `${resized?.scheduledStart} → ${dragged?.scheduledStart}`,
  );

  // 8. Edit durasi melalui form
  await page.getByRole('button', { name: `Edit ${TASK_NAME}` }).click();
  const editDialog = page.getByRole('dialog');
  await editDialog.getByLabel(/Durasi/).fill('3');
  await editDialog.getByRole('button', { name: 'Simpan perubahan' }).click();
  await waitToast('Tugas berhasil diperbarui.');
  const edited = await waitForTask(projectId, taskId, (task) => task.durationDays === 3);
  check('Edit durasi tersimpan', edited?.durationDays === 3, `durasi ${edited?.durationDays}`);

  // 9. Kalender: tambah lalu hapus hari libur
  await page.getByRole('link', { name: 'Kalender', exact: true }).click();
  await page.waitForURL('**/calendar');
  await page.getByLabel('Tanggal').fill('2026-10-30');
  await page.getByLabel('Nama').fill('Libur verifikasi');
  await page.getByRole('button', { name: 'Tambah', exact: true }).click();
  await waitToast('Jadwal diperbarui');
  const holidayItem = page.locator('li', { hasText: 'Libur verifikasi' });
  await holidayItem.first().waitFor({ state: 'visible', timeout: 10000 });
  check('Hari libur tampil di daftar setelah ditambahkan', (await holidayItem.count()) > 0);
  await holidayItem.getByRole('button', { name: 'Hapus' }).click();
  await page.getByRole('button', { name: 'Hapus hari libur' }).click();
  await holidayItem.waitFor({ state: 'detached', timeout: 10000 });
  check('Hari libur dapat dihapus', (await page.getByText('Libur verifikasi').count()) === 0);

  // 10. Halaman tim
  await page.getByRole('link', { name: 'Tim & Biaya', exact: true }).click();
  await page.waitForURL('**/team');
  await page.getByText('Andi Pratama').first().waitFor();
  await page.getByText('Total estimasi biaya').waitFor();
  check('Halaman Tim menampilkan anggota dan biaya', true);
  await page.screenshot({ path: 'docs/screenshots/team.png', fullPage: false });

  // 11. Halaman analisis
  await page.getByRole('link', { name: 'Analisis', exact: true }).click();
  await page.waitForURL('**/analysis');
  await page.getByText('Tabel CPM').waitFor();
  await page.getByTestId('pert-svg').waitFor();
  check('Analisis CPM dan diagram PERT tampil', true);
  await page.screenshot({ path: 'docs/screenshots/analysis.png', fullPage: false });

  // 12. Refresh: data tetap tersimpan
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Tabel CPM').waitFor();
  await page.goto(`${BASE}/projects/${projectId}/gantt`, { waitUntil: 'networkidle' });
  await page.getByText(TASK_NAME).first().waitFor();
  check('Data bertahan setelah refresh halaman', true);

  // 13. Logout dan proteksi rute
  await page.getByRole('button', { name: 'Keluar' }).click();
  await page.waitForURL('**/login');
  check('Logout kembali ke halaman login', true);
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login');
  check('Rute terproteksi setelah logout', true);

  // 14. Tidak ada error runtime atau error console
  check('Tidak ada error runtime halaman', pageErrors.length === 0, pageErrors.join(' | '));
  check(
    'Tidak ada error console',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '),
  );

  console.log('\nRingkasan verifikasi browser:');
  console.log(`  ${checks.filter((item) => item.ok).length}/${checks.length} pemeriksaan lolos`);
  console.log(`  Screenshot: docs/screenshots/*.png`);
  if (failures.length > 0) {
    console.log('  Kegagalan:');
    for (const failure of failures) console.log(`   - ${failure}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Verifikasi browser gagal:', error);
  console.error('URL saat gagal:', page.url());
  try {
    await page.screenshot({ path: 'docs/screenshots/failure.png', fullPage: false });
    console.error('Cuplikan teks halaman:', (await page.locator('body').innerText()).slice(0, 1200));
  } catch (screenshotError) {
    console.error('Gagal mengambil screenshot kegagalan:', screenshotError);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
