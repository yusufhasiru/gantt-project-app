import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, PageLoader } from './States.js';

describe('status antarmuka', () => {
  it('menampilkan loading state dengan status aksesibel', () => {
    render(<PageLoader label="Memuat proyek..." />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Memuat proyek...')).toBeInTheDocument();
  });

  it('menampilkan error state dan tombol coba lagi', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Server tidak dapat dijangkau." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Server tidak dapat dijangkau.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('menampilkan empty state dengan ajakan aksi', () => {
    render(
      <EmptyState
        title="Belum ada data"
        description="Tambahkan data pertama."
        action={<button type="button">Tambah</button>}
      />,
    );
    expect(screen.getByText('Belum ada data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tambah' })).toBeInTheDocument();
  });
});
