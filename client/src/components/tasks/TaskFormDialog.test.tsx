import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskFormDialog } from './TaskFormDialog.js';
import { ToastProvider } from '../ui/Toast.js';
import { project, tasks } from '../../test/fixtures.js';

function renderDialog(overrides: { onClose?: () => void; task?: (typeof tasks)[number] | null } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TaskFormDialog
          open
          onClose={onClose}
          projectId={project.id}
          projectStart={project.startDate}
          tasks={tasks}
          task={overrides.task ?? null}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

function submitForm() {
  const form = document.getElementById('task-form');
  expect(form).not.toBeNull();
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('TaskFormDialog', () => {
  it('menampilkan validasi ketika nama dan durasi tidak valid', async () => {
    renderDialog();
    await userEvent.clear(screen.getByLabelText(/Nama tugas/));
    await userEvent.clear(screen.getByLabelText(/Durasi/));
    submitForm();

    expect(await screen.findByText('Nama tugas wajib diisi.')).toBeInTheDocument();
    expect(await screen.findByText('Durasi wajib diisi.')).toBeInTheDocument();
  });

  it('mengirim payload ke API dan menutup dialog saat berhasil', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ tasks }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.type(screen.getByLabelText(/Nama tugas/), 'Tugas Baru');
    await user.clear(screen.getByLabelText(/Durasi/));
    await user.type(screen.getByLabelText(/Durasi/), '4');
    submitForm();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/projects/project-1/tasks');
    expect(options.method).toBe('POST');
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Tugas Baru', durationDays: 4, startDate: '2026-10-19' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('menampilkan pesan error server dan tidak menutup dialog saat mutasi gagal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: { code: 'CYCLE_DETECTED', message: 'Dependensi membentuk siklus.', details: {} },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.type(screen.getByLabelText(/Nama tugas/), 'Tugas Gagal');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Dependensi membentuk siklus.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('menampilkan field tugas induk dalam keadaan read-only', () => {
    renderDialog({ task: tasks[0] });
    expect(screen.getByText(/Tugas ini adalah tugas induk/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Durasi/)).toBeDisabled();
    expect(screen.getByLabelText(/Tanggal mulai paling awal/)).toBeDisabled();
    expect(screen.getByLabelText(/Progres/)).toBeDisabled();
  });
});
