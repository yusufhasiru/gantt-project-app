import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { scheduleProject } from '@gantt/shared';

const prisma = new PrismaClient();

const PROJECT_NAME = 'Pengembangan Aplikasi Mobile Toko Online';
const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Demo12345';

const GROUP_COLORS: Record<string, string> = {
  planning: '#6366f1',
  design: '#ec4899',
  development: '#0ea5e9',
  testing: '#f59e0b',
  launch: '#10b981',
};

interface SeedTask {
  key: string;
  parentKey: string | null;
  name: string;
  durationDays: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  color: string;
  progress: number;
  optimisticDays?: number;
  pessimisticDays?: number;
  assignees: Array<{ resourceKey: string; allocationPercent: number }>;
}

interface SeedDependency {
  predecessorKey: string;
  successorKey: string;
  type: 'FS' | 'SS';
  lagDays: number;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: 'Demo GanttFlow', passwordHash },
    create: { name: 'Demo GanttFlow', email: DEMO_EMAIL, passwordHash },
  });

  await prisma.project.deleteMany({ where: { ownerId: user.id, name: PROJECT_NAME } });

  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      name: PROJECT_NAME,
      description:
        'Contoh proyek pengembangan aplikasi mobile toko online: perencanaan, desain, pengembangan, pengujian, dan peluncuran.',
      startDate: '2026-10-19',
      weekendDays: JSON.stringify([0, 6]),
      holidays: {
        create: [
          { date: '2026-11-11', name: 'Libur internal (contoh)' },
          { date: '2026-12-25', name: 'Hari Raya Natal' },
        ],
      },
    },
  });

  const resources = {
    andi: await prisma.resource.create({
      data: {
        projectId: project.id,
        name: 'Andi Pratama',
        email: 'andi.pratama@example.com',
        role: 'Project Manager',
        salary: 15_000_000,
      },
    }),
    budi: await prisma.resource.create({
      data: {
        projectId: project.id,
        name: 'Budi Santoso',
        email: 'budi.santoso@example.com',
        role: 'Backend Developer',
        salary: 12_000_000,
      },
    }),
    citra: await prisma.resource.create({
      data: {
        projectId: project.id,
        name: 'Citra Lestari',
        email: 'citra.lestari@example.com',
        role: 'UI/UX Designer',
        salary: 10_000_000,
      },
    }),
    dewi: await prisma.resource.create({
      data: {
        projectId: project.id,
        name: 'Dewi Anggraini',
        email: 'dewi.anggraini@example.com',
        role: 'QA Engineer',
        salary: 9_000_000,
      },
    }),
  };

  const seedTasks: SeedTask[] = [
    {
      key: 'planning',
      parentKey: null,
      name: 'Perencanaan',
      durationDays: 1,
      priority: 'HIGH',
      color: GROUP_COLORS.planning,
      progress: 0,
      assignees: [],
    },
    {
      key: 'kickoff',
      parentKey: 'planning',
      name: 'Kickoff dan kebutuhan',
      durationDays: 3,
      priority: 'HIGH',
      color: GROUP_COLORS.planning,
      progress: 100,
      assignees: [{ resourceKey: 'andi', allocationPercent: 100 }],
    },
    {
      key: 'spec',
      parentKey: 'planning',
      name: 'Penyusunan spesifikasi',
      durationDays: 4,
      priority: 'HIGH',
      color: GROUP_COLORS.planning,
      progress: 60,
      assignees: [{ resourceKey: 'andi', allocationPercent: 100 }],
    },
    {
      key: 'design',
      parentKey: null,
      name: 'Desain',
      durationDays: 1,
      priority: 'MEDIUM',
      color: GROUP_COLORS.design,
      progress: 0,
      assignees: [],
    },
    {
      key: 'wireframe',
      parentKey: 'design',
      name: 'Riset dan wireframe',
      durationDays: 5,
      priority: 'MEDIUM',
      color: GROUP_COLORS.design,
      progress: 0,
      assignees: [{ resourceKey: 'citra', allocationPercent: 100 }],
    },
    {
      key: 'ui-design',
      parentKey: 'design',
      name: 'Desain UI high-fidelity',
      durationDays: 6,
      priority: 'MEDIUM',
      color: GROUP_COLORS.design,
      progress: 0,
      assignees: [{ resourceKey: 'citra', allocationPercent: 100 }],
    },
    {
      key: 'development',
      parentKey: null,
      name: 'Pengembangan',
      durationDays: 1,
      priority: 'HIGH',
      color: GROUP_COLORS.development,
      progress: 0,
      assignees: [],
    },
    {
      key: 'db-api',
      parentKey: 'development',
      name: 'Rancang database dan API',
      durationDays: 5,
      priority: 'HIGH',
      color: GROUP_COLORS.development,
      progress: 0,
      assignees: [{ resourceKey: 'budi', allocationPercent: 100 }],
    },
    {
      key: 'backend',
      parentKey: 'development',
      name: 'Implementasi backend',
      durationDays: 10,
      priority: 'HIGH',
      color: GROUP_COLORS.development,
      progress: 0,
      optimisticDays: 8,
      pessimisticDays: 15,
      assignees: [{ resourceKey: 'budi', allocationPercent: 100 }],
    },
    {
      key: 'frontend',
      parentKey: 'development',
      name: 'Implementasi frontend mobile',
      durationDays: 12,
      priority: 'HIGH',
      color: GROUP_COLORS.development,
      progress: 0,
      assignees: [
        { resourceKey: 'budi', allocationPercent: 50 },
        { resourceKey: 'citra', allocationPercent: 50 },
      ],
    },
    {
      key: 'testing',
      parentKey: null,
      name: 'Pengujian',
      durationDays: 1,
      priority: 'MEDIUM',
      color: GROUP_COLORS.testing,
      progress: 0,
      assignees: [],
    },
    {
      key: 'test-scenario',
      parentKey: 'testing',
      name: 'Skenario uji',
      durationDays: 3,
      priority: 'MEDIUM',
      color: GROUP_COLORS.testing,
      progress: 0,
      assignees: [{ resourceKey: 'dewi', allocationPercent: 100 }],
    },
    {
      key: 'integration-test',
      parentKey: 'testing',
      name: 'Integrasi dan uji sistem',
      durationDays: 6,
      priority: 'HIGH',
      color: GROUP_COLORS.testing,
      progress: 0,
      assignees: [{ resourceKey: 'dewi', allocationPercent: 100 }],
    },
    {
      key: 'bugfix',
      parentKey: 'testing',
      name: 'Perbaikan bug',
      durationDays: 4,
      priority: 'MEDIUM',
      color: GROUP_COLORS.testing,
      progress: 0,
      assignees: [{ resourceKey: 'budi', allocationPercent: 100 }],
    },
    {
      key: 'launch',
      parentKey: null,
      name: 'Peluncuran',
      durationDays: 1,
      priority: 'MEDIUM',
      color: GROUP_COLORS.launch,
      progress: 0,
      assignees: [],
    },
    {
      key: 'release-prep',
      parentKey: 'launch',
      name: 'Persiapan rilis',
      durationDays: 2,
      priority: 'MEDIUM',
      color: GROUP_COLORS.launch,
      progress: 0,
      assignees: [{ resourceKey: 'andi', allocationPercent: 100 }],
    },
    {
      key: 'release',
      parentKey: 'launch',
      name: 'Rilis dan serah terima',
      durationDays: 1,
      priority: 'HIGH',
      color: GROUP_COLORS.launch,
      progress: 0,
      assignees: [{ resourceKey: 'andi', allocationPercent: 100 }],
    },
  ];

  const seedDependencies: SeedDependency[] = [
    { predecessorKey: 'kickoff', successorKey: 'spec', type: 'FS', lagDays: 0 },
    { predecessorKey: 'spec', successorKey: 'wireframe', type: 'SS', lagDays: 2 },
    { predecessorKey: 'wireframe', successorKey: 'ui-design', type: 'FS', lagDays: 0 },
    { predecessorKey: 'spec', successorKey: 'db-api', type: 'FS', lagDays: 0 },
    { predecessorKey: 'db-api', successorKey: 'backend', type: 'FS', lagDays: 0 },
    { predecessorKey: 'ui-design', successorKey: 'frontend', type: 'FS', lagDays: 0 },
    { predecessorKey: 'backend', successorKey: 'frontend', type: 'SS', lagDays: 3 },
    { predecessorKey: 'backend', successorKey: 'test-scenario', type: 'SS', lagDays: 4 },
    { predecessorKey: 'backend', successorKey: 'integration-test', type: 'FS', lagDays: 0 },
    { predecessorKey: 'frontend', successorKey: 'integration-test', type: 'FS', lagDays: 0 },
    { predecessorKey: 'integration-test', successorKey: 'bugfix', type: 'FS', lagDays: 0 },
    { predecessorKey: 'bugfix', successorKey: 'release-prep', type: 'FS', lagDays: 1 },
    { predecessorKey: 'release-prep', successorKey: 'release', type: 'FS', lagDays: 0 },
  ];

  const ids = new Map<string, string>();
  const createdTasks: Array<{
    id: string;
    parentId: string | null;
    position: number;
    durationDays: number;
    startDate: string;
    progress: number;
  }> = [];

  for (const seedTask of seedTasks) {
    const position = seedTasks
      .filter((candidate) => candidate.parentKey === seedTask.parentKey)
      .findIndex((candidate) => candidate.key === seedTask.key);
    const created = await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: seedTask.parentKey ? ids.get(seedTask.parentKey) ?? null : null,
        position,
        name: seedTask.name,
        description: null,
        durationDays: seedTask.durationDays,
        startDate: project.startDate,
        scheduledStart: project.startDate,
        scheduledEnd: project.startDate,
        priority: seedTask.priority,
        color: seedTask.color,
        progress: seedTask.progress,
        optimisticDays: seedTask.optimisticDays ?? null,
        pessimisticDays: seedTask.pessimisticDays ?? null,
      },
    });
    ids.set(seedTask.key, created.id);
    createdTasks.push({
      id: created.id,
      parentId: created.parentId,
      position: created.position,
      durationDays: created.durationDays,
      startDate: created.startDate,
      progress: created.progress,
    });

    for (const assignee of seedTask.assignees) {
      await prisma.assignment.create({
        data: {
          taskId: created.id,
          resourceId: resources[assignee.resourceKey as keyof typeof resources].id,
          allocationPercent: assignee.allocationPercent,
        },
      });
    }

  }

  const dependencyRecords = [];
  for (const [index, seedDependency] of seedDependencies.entries()) {
    dependencyRecords.push({
      id: `seed-dep-${index + 1}`,
      predecessorId: ids.get(seedDependency.predecessorKey) as string,
      successorId: ids.get(seedDependency.successorKey) as string,
      type: seedDependency.type,
      lagDays: seedDependency.lagDays,
    });
  }
  await prisma.dependency.createMany({ data: dependencyRecords });

  const schedule = scheduleProject({
    tasks: createdTasks,
    dependencies: dependencyRecords.map((dependency) => ({
      ...dependency,
      type: dependency.type as 'FS' | 'SS',
    })),
    calendar: { weekendDays: [0, 6], holidays: ['2026-11-11', '2026-12-25'] },
    projectStart: project.startDate,
  });

  for (const task of createdTasks) {
    const scheduled = schedule.byId[task.id];
    await prisma.task.update({
      where: { id: task.id },
      data: {
        scheduledStart: scheduled.scheduledStart,
        scheduledEnd: scheduled.scheduledEnd,
        durationDays: scheduled.durationDays,
        progress: scheduled.progress,
      },
    });
  }

  console.log(`Seed selesai: proyek "${project.name}" untuk ${DEMO_EMAIL}.`);
  console.log('Akun demo hanya untuk development lokal.');
}

main()
  .catch((error) => {
    console.error('Seed gagal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
