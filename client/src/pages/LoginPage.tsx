import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { loginSchema } from '@gantt/shared';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.js';
import { Field, inputClass } from '../components/ui/Field.js';
import { BrandMark } from '../components/layout/AppLayout.js';

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: 'demo@example.com', password: '' },
  });

  if (user) return <Navigate to="/projects" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate('/projects', { replace: true });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Gagal masuk. Coba lagi.');
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.45),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(14,165,233,0.35),transparent_50%)]"
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 bg-white/15" />
            <span className="text-xl font-semibold tracking-tight">GanttFlow</span>
          </div>
          <h1 className="mt-16 max-w-md text-4xl font-semibold leading-tight">
            Rencanakan proyek, kendalikan jadwal, capai target.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
            Gantt Chart interaktif dengan penjadwalan otomatis, jalur kritis, PERT, kalender kerja,
            dan estimasi biaya tim dalam satu tempat.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-200">
            {[
              'Penjadwalan otomatis berbasis hari kerja dan dependensi',
              'Drag & resize bar dengan pratinjau jadwal dari mesin yang sama',
              'Analisis Critical Path Method dan diagram PERT',
              'Perhitungan biaya anggota tim dan peringatan over-alokasi',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">
          Dibangun dengan React, Express, Prisma, dan SQLite.
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              Gantt<span className="text-brand-600">Flow</span>
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Masuk ke akun Anda</h2>
          <p className="mt-1 text-sm text-slate-500">
            Belum punya akun?{' '}
            <Link to="/register" className="font-medium text-brand-600 hover:underline">
              Daftar sekarang
            </Link>
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
            <Field label="Email" htmlFor="email" error={errors.email?.message} required>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={inputClass}
                placeholder="nama@perusahaan.com"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message} required>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className={inputClass}
                placeholder="Minimal 8 karakter"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </Field>

            {serverError ? (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {serverError}
              </div>
            ) : null}

            <Button type="submit" loading={isSubmitting} className="w-full">
              Masuk
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Akun demo (khusus development lokal)</p>
            <p className="mt-1">
              Email: <span className="font-mono">demo@example.com</span> · Password:{' '}
              <span className="font-mono">Demo12345</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
