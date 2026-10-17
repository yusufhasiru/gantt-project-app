# PROGRESS — GanttFlow

Dokumen ini mencatat pekerjaan yang benar-benar dilakukan, perintah verifikasi yang dijalankan, dan
hasil aktualnya. Tanggal kerja: 2026-10-17.

## Ringkasan status

| Fase | Status | Bukti utama |
|---|---|---|
| 0 — Fondasi | Selesai | `npm install` exit 0, health endpoint 200 |
| 1 — Mesin inti `shared` | Selesai | 62 test lulus, 8 file |
| 2 — Backend & database | Selesai | Migration `20261017025921_init`, 22 integration test lulus, seed sukses |
| 3 — Frontend | Selesai | Typecheck client lulus, 14 component test lulus, build Vite lulus |
| 4 — Integrasi & browser | Selesai | 19/19 pemeriksaan browser lulus, 4 screenshot |
| 5 — Finalisasi | Selesai | Audit `.gitignore`, README, verifikasi akhir |
| 6 — GitHub | Menunggu URL | Commit lokal dibuat; push belum dilakukan |

## Lingkungan

- macOS (darwin), Node.js v24.21.0, npm 11.19.0, Git terpasang.
- Direktori kerja awal: `.../freebuff project/gantt-project` (kosong).
- Proyek `e-office` di direktori induk **tidak disentuh**. Aplikasi dibuat di subfolder
  `gantt-project-app` sesuai struktur monorepo.
- `server/.env` dibuat dengan JWT acak 64 karakter hex; nilainya tidak dicetak atau dicatat.

## Fase 0 — Fondasi

Dibuat:

- Root `package.json` dengan npm workspaces (`shared`, `server`, `client`) dan script berurutan.
- `tsconfig.base.json`, konfigurasi TypeScript per workspace dengan project reference shared → server.
- `shared` (build menghasilkan `dist` + deklarasi tipe).
- Server Express + `GET /api/health` + Prisma schema SQLite.
- Client React/Vite/Tailwind dengan proxy `/api`.
- `.gitignore`, `.env.example`, README, PROGRESS.

Verifikasi aktual:

- `npm install` → exit 0; Prisma Client ter-generate melalui `postinstall`.
- `npm run dev` → server dan Vite berjalan.
- `GET http://localhost:3001/api/health` → `200 {"status":"ok","database":"ok",...}`.
- `GET http://localhost:5173/` → 200.

Kegagalan yang ditemukan dan diperbaiki:

- Pada penulisan awal, file `server/prisma/schema.prisma` sempat terisi konten yang tidak terkait
  (schema Mongoose). File langsung ditulis ulang dengan schema GanttFlow yang benar sebelum migrasi
  dijalankan; tidak ada database yang terlanjur dibuat dari schema salah.

## Fase 1 — Mesin inti

Modul yang dibuat di `shared/src`:

- `dates.ts` — parsing/format ISO UTC, penjumlahan hari, diff, `todayISODate`.
- `calendar.ts` — validasi kalender, hari kerja, `nextWorkingDay`, `shiftWorkingDays` (positif/nol/
  negatif), `workingDaysBetween`, ordinal hari kerja, guard loop.
- `tree.ts` — struktur parent-child, WBS, flatten, descendant, kedalaman maksimum 3.
- `scheduler.ts` — validasi struktur/dependensi, deteksi siklus (Kahn), penjadwalan FS/SS + lag,
  summary task bottom-up.
- `cpm.ts` — forward/backward pass dengan ordinal hari kerja, float, jalur kritis.
- `pert.ts` — estimasi tiga titik dan variansi.
- `cost.ts` — tarif harian, biaya per tugas/resource, over-alokasi per hari kerja.
- `metrics.ts`, `schemas.ts`, `types.ts`, `errors.ts`, `index.ts`.

Vektor wajib yang diuji dan hasilnya:

1. Mulai Jumat 2026-10-23, durasi 3 hari kerja → selesai **2026-10-27**. Lulus.
2. FS lag 0 → penerus mulai **2026-10-28**. Lulus.
3. SS lag 2 → penerus mulai **2026-10-27**. Lulus.
4. Libur Senin 2026-10-26 → selesai **2026-10-28**. Lulus.
5. CPM A(3), B(2) FS A, C(5) FS A, D(1) FS B,C → A/C/D kritis, B float 3, PE 8. Lulus.

Tambahan test: tahun kabisat, pergantian bulan/tahun, lag negatif (termasuk batas `startDate`),
libur berurutan, durasi 1 hari, mulai pada hari non-kerja, beberapa jalur kritis, graph tanpa
dependensi, graph siklik, graph 200 tugas, parent-child 3 level, alokasi bertumpang tindih, kalender
invalid.

Perintah dan hasil:

```text
npm run build -w @gantt/shared        → exit 0
npm test -w @gantt/shared             → 8 file, 62 test lulus
```

Kegagalan awal dan perbaikannya:

- Build gagal karena `computeCpm` memanggil `getLeafIds` pada tipe input CPM yang tidak memiliki
  `parentId`/`position`. CPM memang hanya menerima tugas daun dari pemanggil, sehingga validasi
  duplikat tersebut dihapus; perilaku CPM tidak diubah.
- Dua test awal gagal karena ekspektasi test saya sendiri salah hitung: ordinal untuk FS lag -1
  (seharusnya ES 3, bukan 4) dan nilai `te` PERT (10,667 bukan 10). Nilai mesin diperiksa manual
  lalu ekspektasi test dikoreksi; implementasi tidak dilonggarkan.

Gate Fase 1: lulus.

## Fase 2 — Backend, database, dan API

Dibuat:

- Prisma schema: `User`, `Project`, `Holiday`, `Task`, `Dependency`, `Resource`, `Assignment`, dengan
  unique constraint, index relasi, dan cascade delete.
- Migration awal `20261017025921_init`.
- Autentikasi: bcryptjs (10 rounds), JWT 7 hari, middleware `requireAuth`, rate limit login/register,
  helmet, CORS eksplisit, body limit 100 KB.
- Seluruh route wajib + route tambahan `GET /api/projects/:id/resources`.
- `services/access.ts` untuk pemeriksaan kepemilikan dan serialisasi.
- `services/recompute.ts` untuk penjadwalan ulang transaksional.
- `services/snapshot.ts` dan `services/analysis.ts` (CPM, PERT, biaya, beban kerja).
- Seed idempoten dengan 17 tugas, 13 dependensi, 4 anggota, 13 alokasi, dan 2 hari libur.

Perintah dan hasil aktual:

```text
npx prisma migrate dev --name init --skip-seed   → migration diterapkan
npm run typecheck -w @gantt/server               → exit 0
npm run db:seed                                  → sukses (dijalankan berulang, tetap konsisten)
npm test -w @gantt/server                        → 22 test lulus
```

Integration test mencakup register/login/hash password, token invalid, token kedaluwarsa, CRUD
proyek, CRUD tugas, parent-child & kedalaman, FS/SS+lag, siklus, kalender/libur, assignment/resource,
CPM/PERT, isolasi kepemilikan (404 lintas pengguna), cascade delete, rollback transaksi saat
recompute gagal, validasi input, format error, hapus hari libur, dan akses tanpa autentikasi.

Data seed yang terverifikasi lewat API:

- 17 tugas, 13 dependensi, 4 resource, 13 assignment, 2 holiday.
- Proyek mulai 2026-10-19, selesai terjadwal 2026-12-16, 42 hari kerja.
- Total estimasi biaya ± Rp31.863.636.
- 6 baris peringatan over-alokasi pada hari kerja.

Gate Fase 2: lulus.

## Fase 3 — Frontend

Halaman: `/login`, `/register`, `/projects`, `/projects/:id/gantt`, `/team`, `/calendar`, `/analysis`,
plus halaman 404 dan redirect rute terproteksi.

Komponen utama:

- `GanttChart` SVG: tabel tersinkron, header harian/mingguan/bulanan, arsiran non-kerja, bar progres,
  bracket summary, panah FS/SS, garis hari ini, tooltip, toggle jalur kritis, drag/resize dengan
  pratinjau `previewSchedule`, penanganan `pointercancel`.
- Dialog tugas (validasi Zod + react-hook-form), dependensi, alokasi, anggota tim, proyek.
- `PertDiagram` SVG activity-on-node dengan zoom 60–180% dan scroll.
- `MiniCalendar`, kalender kerja, tim & biaya, analisis CPM/PERT.
- Toast, loading/empty/error state, confirm dialog, layout responsif (tabel Gantt dapat
  disembunyikan di layar kecil).

Perintah dan hasil:

```text
npm run typecheck -w @gantt/client     → exit 0
npm test -w @gantt/client              → 4 file, 14 test lulus
npm run build -w @gantt/client         → exit 0
```

Ukuran build client: JS 417,23 KB (gzip 123,46 KB), CSS 30,33 KB (gzip 6,00 KB).

Satu test awal gagal karena teks error yang sama muncul pada alert inline dan toast sehingga
`findByText` menemukan dua elemen. Test diperbaiki agar memeriksa `role="alert"`; UI tidak diubah.

Gate Fase 3: lulus.

## Fase 4 — Integrasi dan verifikasi browser

Verifikasi akhir:

```text
npm run typecheck   → exit 0
npm test            → 62 + 22 + 14 = 98 test lulus, 0 gagal
npm run build       → exit 0 (shared, server, client)
```

Server dev dan Vite dijalankan sebagai proses background. Health check 200, client 200. Login demo
melalui API berhasil dan snapshot proyek seed sesuai data.

### Bug yang ditemukan verifikasi browser dan perbaikannya

- **Gejala:** setelah menambah hari libur di halaman Kalender, aplikasi tiba-tiba kembali ke halaman
  login.
- **Penyebab:** route `DELETE /api/holidays/:id` dipasang pada `calendarRouter` yang tidak memakai
  middleware `requireAuth`. `userId(res)` kosong → 401; handler 401 global menghapus sesi.
- **Perbaikan:** menambahkan `calendarRouter.use(requireAuth)` dan test regresi yang memastikan
  DELETE tanpa token → 401, lintas pengguna → 404, pemilik → 200 serta jadwal dihitung ulang.
- **Verifikasi:** seluruh 22 integration test lulus dan verifikasi browser lulus.

Dua test tambahan ditambahkan pada audit akhir: penolakan JWT kedaluwarsa dan pembatalan transaksi
(perubahan nama tugas di-rollback ketika penjadwalan ulang gagal karena siklus di database).

### Hasil `npm run verify:browser`

19/19 pemeriksaan lulus:

1. Akses tanpa login diarahkan ke `/login`.
2. Login demo berhasil dan dashboard tampil.
3. Gantt Chart proyek seed terbuka.
4. 17 baris tugas seed tampil.
5. Semua panah dependensi FS/SS dirender (13/13).
6. Tugas baru tersimpan melalui API.
7. Dependensi FS menggeser mulai tugas ke 2026-10-22.
8. Resize bar menambah durasi hari kerja.
9. Drag bar mengubah tanggal mulai (2026-10-22 → 2026-10-26).
10. Edit durasi melalui form tersimpan.
11. Hari libur tampil setelah ditambahkan.
12. Hari libur dapat dihapus.
13. Halaman Tim menampilkan anggota dan biaya.
14. Analisis CPM dan diagram PERT tampil.
15. Data bertahan setelah refresh.
16. Logout kembali ke halaman login.
17. Rute terproteksi setelah logout.
18. Tidak ada error runtime halaman.
19. Tidak ada error console.

Screenshot (dihasilkan skrip, 1440×950): `docs/screenshots/dashboard.png`, `gantt.png`, `team.png`,
`analysis.png`. Screenshot belum ditinjau manual per piksel; isi halaman diverifikasi melalui
asseri DOM pada skrip.

Setelah verifikasi, seed dijalankan ulang agar tugas sementara “Verifikasi Browser” tidak tertinggal
pada data demo.

Gate Fase 4: lulus.

## Fase 5 — Finalisasi dan kebersihan repository

- `.gitignore` memuat `node_modules`, `dist`, `coverage`, `.env`, `.env.*` (kecuali `.env.example`),
  seluruh file `*.db`/jurnal SQLite, log, `.DS_Store`, dan artefak test browser.
- `server/.env` dan database (`dev.db`, `test.db`) tidak di-commit.
- Tidak ada token, password, atau secret nyata di source/dokumentasi; akun demo memakai password yang
  memang didokumentasikan sebagai khusus pengembangan lokal.
- README menjelaskan instalasi, env, migrasi, seed, test, build, API, mesin penjadwalan, asumsi,
  batasan, dan troubleshooting.
- `package-lock.json` disimpan untuk instalasi reproduksibel.

## Fase 6 — GitHub

- Git repository lokal diinisialisasi di `gantt-project-app`.
- Commit awal dibuat dengan seluruh source, migration, test, dokumentasi, dan screenshot.
- **Push belum dilakukan** karena URL repository GitHub belum diberikan. Tidak ada URL, visibilitas,
  atau status remote yang diklaim.

## Checklist penerimaan

### Proyek dan autentikasi

- [x] Register, login, logout berfungsi (integration test + browser).
- [x] Pengguna hanya dapat mengakses proyek miliknya (test lintas pengguna → 404).
- [x] CRUD proyek berfungsi dan konfirmasi hapus tersedia.
- [x] Snapshot proyek konsisten (project, tasks, dependencies, resources, assignments, metrics).
- [x] Data bertahan setelah refresh dan restart server (SQLite + browser refresh).

### Tugas dan Gantt

- [x] CRUD tugas, durasi, tanggal, prioritas, warna, progres tersimpan.
- [x] Parent-child maksimal 3 level dan summary task terhitung otomatis.
- [x] WBS dan urutan posisi konsisten.
- [x] Bar dan header memakai skala/rentang tanggal yang sama.
- [x] Panah FS dan SS dirender (13/13 pada data seed).
- [x] Drag mengubah jadwal; resize mengubah durasi hari kerja (browser + API).
- [x] Tugas induk tidak dapat di-drag/di-resize dan field terjadwalnya read-only.
- [x] Siklus ditolak dan jadwal dihitung ulang setelah perubahan.

### Kalender, resource, dan biaya

- [x] Akhir pekan dapat diubah; hari libur dapat ditambah/dihapus.
- [x] Durasi dan penjadwalan hanya menghitung hari kerja.
- [x] Perubahan kalender memicu penjadwalan ulang (API test).
- [x] Resource dan assignment dapat dikelola.
- [x] Biaya memperhitungkan alokasi; summary task tidak menggandakan biaya.
- [x] Over-alokasi ditandai per hari kerja (6 baris pada data seed).

### Analisis

- [x] Tabel CPM menampilkan ES/EF/LS/LF/float/status.
- [x] Vektor jalur kritis wajib lulus (A, C, D kritis; B float 3; PE 8).
- [x] Diagram PERT SVG menampilkan node dan panah, node kritis merah.
- [x] Estimasi PERT dihitung saat data lengkap; tidak menampilkan nilai palsu saat tidak lengkap.
- [x] Zoom dan scroll PERT berfungsi.

### UI dan kualitas

- [x] Tombol utama memiliki aksi dan terhubung ke API.
- [x] Loading, empty, error state, toast, dan dialog konfirmasi tersedia.
- [x] Validasi form client + server (Zod).
- [x] Layout responsif; tabel Gantt dapat disembunyikan di layar kecil.
- [x] Tidak ada error runtime/console pada alur verifikasi browser.
- [x] Tidak ada data mock yang menggantikan API pada alur utama.

### Repository

- [x] `npm run typecheck` lolos.
- [x] `npm test` lolos (98 test).
- [x] `npm run build` lolos.
- [x] `.env`, database lokal, `node_modules`, dan build output diabaikan Git.
- [x] README dan PROGRESS sesuai kondisi nyata.
- [ ] Push GitHub belum diverifikasi — menunggu URL repository dari pengguna.

## Batasan/belum dikerjakan

- Push ke GitHub (butuh URL repository).
- Kolaborasi real-time, email, ekspor PDF, aplikasi native, multi-bahasa, deployment cloud.
- Pengujian gestur sentuh khusus dan audit visual manual per piksel.
- PERT proyek memakai jalur kritis utama; variansi tidak menjumlahkan seluruh jalur paralel.
