import type { ProjectRecord, TaskRecord } from '@gantt/shared';

export const project: ProjectRecord = {
  id: 'project-1',
  ownerId: 'user-1',
  name: 'Proyek Uji',
  description: 'Deskripsi proyek uji',
  startDate: '2026-10-19',
  weekendDays: [0, 6],
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const tasks: TaskRecord[] = [
  {
    id: 'parent',
    projectId: 'project-1',
    parentId: null,
    position: 0,
    name: 'Perencanaan',
    description: null,
    durationDays: 4,
    startDate: '2026-10-19',
    scheduledStart: '2026-10-19',
    scheduledEnd: '2026-10-22',
    priority: 'HIGH',
    color: '#6366f1',
    progress: 50,
    optimisticDays: null,
    pessimisticDays: null,
  },
  {
    id: 'a',
    projectId: 'project-1',
    parentId: 'parent',
    position: 0,
    name: 'Kickoff',
    description: null,
    durationDays: 2,
    startDate: '2026-10-19',
    scheduledStart: '2026-10-19',
    scheduledEnd: '2026-10-20',
    priority: 'HIGH',
    color: '#6366f1',
    progress: 100,
    optimisticDays: 1,
    pessimisticDays: 3,
  },
  {
    id: 'b',
    projectId: 'project-1',
    parentId: 'parent',
    position: 1,
    name: 'Spesifikasi',
    description: null,
    durationDays: 2,
    startDate: '2026-10-19',
    scheduledStart: '2026-10-21',
    scheduledEnd: '2026-10-22',
    priority: 'MEDIUM',
    color: '#6366f1',
    progress: 0,
    optimisticDays: null,
    pessimisticDays: null,
  },
];

export const dependencies = [
  {
    id: 'dep-1',
    predecessorId: 'a',
    successorId: 'b',
    type: 'FS' as const,
    lagDays: 0,
  },
];

export const calendar = { weekendDays: [0, 6], holidays: [] as string[] };
