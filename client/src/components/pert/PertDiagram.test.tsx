import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { computeCpm } from '@gantt/shared';
import { PertDiagram } from './PertDiagram.js';
import { calendar, dependencies, project, tasks } from '../../test/fixtures.js';

const leafTasks = tasks.filter((task) => task.parentId === 'parent');
const cpm = computeCpm(
  leafTasks.map((task) => ({
    id: task.id,
    name: task.name,
    durationDays: task.durationDays,
    scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd,
  })),
  dependencies,
  project.startDate,
  calendar,
);

describe('PertDiagram', () => {
  it('menampilkan node CPM dan menandai node kritis', () => {
    render(<PertDiagram nodes={cpm.tasks} dependencies={dependencies} />);
    expect(screen.getByTestId('pert-node-a')).toBeInTheDocument();
    expect(screen.getByTestId('pert-node-b')).toBeInTheDocument();
    expect(screen.getAllByText(/KRITIS/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('pert-svg').querySelectorAll('path').length).toBeGreaterThan(1);
  });

  it('mendukung zoom in, zoom out, dan reset', async () => {
    const user = userEvent.setup();
    render(<PertDiagram nodes={cpm.tasks} dependencies={dependencies} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Perbesar diagram PERT'));
    expect(screen.getByText('120%')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Perkecil diagram PERT'));
    await user.click(screen.getByLabelText('Perkecil diagram PERT'));
    expect(screen.getByText('80%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
