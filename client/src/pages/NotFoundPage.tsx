import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Halaman tidak ditemukan</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Alamat yang Anda buka tidak tersedia atau proyek sudah dihapus.
      </p>
      <Link
        to="/projects"
        className="mt-6 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        Kembali ke daftar proyek
      </Link>
    </div>
  );
}
