import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GanttChart } from './GanttChart.js';
import { calendar, dependencies, project, tasks } from '../../test/fixtures.js';

function setup(showCritical = false) {
  const onToggleCritical = vi.fn();
  const view = render(
    <GanttChart
      project={project}
      tasks={tasks}
      dependencies={dependencies}
      resources={[{ id: 'r1', name: 'Andi Pratama' }]}
      assignments={[{ id: 'as1', taskId: 'a', resourceId: 'r1', allocationPercent: 100 }]}
      calendar={calendar}
      showCritical={showCritical}
      onToggleCritical={onToggleCritical}
      onAddTask={vi.fn()}
      onEditTask={vi.fn()}
      onManageDependencies={vi.fn()}
      onManageAssignments={vi.fn()}
      onDeleteTask={vi.fn()}
      onScheduleChange={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  return { ...view, onToggleCritical };
}

describe('GanttChart', () => {
  it('menampilkan bar, summary task, dan panah dependensi dari data', () => {
    setup();
    expect(screen.getByTestId('gantt-bar-a')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-bar-b')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-summary-parent')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-arrow-dep-1')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-timeline').querySelector('svg')).toBeInTheDocument();
  });

  it('dapat menutup dan membuka kembali sub-tugas', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByTestId('gantt-bar-a')).toBeInTheDocument();

    await user.click(screen.getByTestId('collapse-parent'));
    expect(screen.queryByTestId('gantt-bar-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gantt-bar-b')).not.toBeInTheDocument();
    expect(screen.getByTestId('gantt-summary-parent')).toBeInTheDocument();

    await user.click(screen.getByTestId('collapse-parent'));
    expect(screen.getByTestId('gantt-bar-a')).toBeInTheDocument();
  });

  it('menandai tugas kritis ketika sorotan jalur kritis aktif', () => {
    const { rerender } = setup(false);
    expect(screen.getByRole('button', { name: 'Kickoff' }).className).not.toContain('text-rose-600');

    rerender(
      <GanttChart
        project={project}
        tasks={tasks}
        dependencies={dependencies}
        resources={[]}
        assignments={[]}
        calendar={calendar}
        showCritical
        onToggleCritical={vi.fn()}
        onAddTask={vi.fn()}
        onEditTask={vi.fn()}
        onManageDependencies={vi.fn()}
        onManageAssignments={vi.fn()}
        onDeleteTask={vi.fn()}
        onScheduleChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Kickoff' }).className).toContain('text-rose-600');
    expect(screen.getByRole('button', { name: 'Spesifikasi' }).className).toContain('text-rose-600');
  });

  it('menampilkan empty state saat proyek belum memiliki tugas', () => {
    render(
      <GanttChart
        project={project}
        tasks={[]}
        dependencies={[]}
        resources={[]}
        assignments={[]}
        calendar={calendar}
        showCritical={false}
        onToggleCritical={vi.fn()}
        onAddTask={vi.fn()}
        onEditTask={vi.fn()}
        onManageDependencies={vi.fn()}
        onManageAssignments={vi.fn()}
        onDeleteTask={vi.fn()}
        onScheduleChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText('Belum ada tugas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tambah tugas pertama' })).toBeInTheDocument();
  });

  it('memanggil toggle jalur kritis dari toolbar', async () => {
    const user = userEvent.setup();
    const { onToggleCritical } = setup();
    await user.click(screen.getByTestId('critical-toggle'));
    expect(onToggleCritical).toHaveBeenCalledTimes(1);
  });
});
