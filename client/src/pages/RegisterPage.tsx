import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { emailSchema, passwordSchema, userNameSchema } from '@gantt/shared';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.js';
import { Field, inputClass } from '../components/ui/Field.js';
import { BrandMark } from '../components/layout/AppLayout.js';

const registerFormSchema = z
  .object({
    name: userNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak sama.',
    path: ['confirmPassword'],
  });

type RegisterValues = z.infer<typeof registerFormSchema>;

export function RegisterPage() {
  const { user, register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  if (user) return <Navigate to="/projects" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerUser(values.name, values.email, values.password);
      navigate('/projects', { replace: true });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Gagal mendaftar. Coba lagi.');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <span className="text-xl font-semibold tracking-tight text-slate-900">
            Gantt<span className="text-brand-600">Flow</span>
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Buat akun baru</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sudah punya akun?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Masuk
          </Link>
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
          <Field label="Nama lengkap" htmlFor="name" error={errors.name?.message} required>
            <input
              id="name"
              className={inputClass}
              autoComplete="name"
              placeholder="Nama Anda"
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message} required>
            <input
              id="email"
              type="email"
              className={inputClass}
              autoComplete="email"
              placeholder="nama@perusahaan.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            hint="Minimal 8 karakter."
            required
          >
            <input
              id="password"
              type="password"
              className={inputClass}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </Field>
          <Field
            label="Konfirmasi password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
            required
          >
            <input
              id="confirmPassword"
              type="password"
              className={inputClass}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register('confirmPassword')}
            />
          </Field>

          {serverError ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </div>
          ) : null}

          <Button type="submit" loading={isSubmitting} className="w-full">
            Daftar
          </Button>
        </form>
      </div>
    </div>
  );
}
