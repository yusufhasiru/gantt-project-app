export const DEPENDENCY_TYPES = ['FS', 'SS'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface CalendarConfig {
  /** Hari akhir pekan mengikuti JavaScript: 0 = Minggu ... 6 = Sabtu. */
  weekendDays: number[];
  /** Himpunan tanggal ISO YYYY-MM-DD. */
  holidays: readonly string[];
}

export interface ScheduleTaskInput {
  id: string;
  parentId: string | null;
  position: number;
  durationDays: number;
  /** Tanggal mulai paling awal yang diminta pengguna. */
  startDate: string;
  progress: number;
}

export interface DependencyInput {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

export interface ScheduledValues {
  scheduledStart: string;
  scheduledEnd: string;
  durationDays: number;
  progress: number;
  isSummary: boolean;
}

export interface ScheduledTask extends ScheduledValues {
  id: string;
}

export interface ScheduleResult {
  byId: Record<string, ScheduledValues>;
  order: string[];
  leafIds: string[];
}

export interface TaskRecord extends ScheduleTaskInput {
  projectId: string;
  name: string;
  description: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  priority: TaskPriority;
  color: string;
  optimisticDays: number | null;
  pessimisticDays: number | null;
}

export interface DependencyRecord {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

export interface HolidayRecord {
  id: string;
  projectId: string;
  date: string;
  name: string;
}

export interface ResourceRecord {
  id: string;
  projectId: string;
  name: string;
  email: string;
  role: string;
  salary: number;
}

export interface AssignmentRecord {
  id: string;
  taskId: string;
  resourceId: string;
  allocationPercent: number;
}

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  startDate: string;
  weekendDays: number[];
  createdAt: string;
}

export interface ProjectSnapshot {
  project: ProjectRecord & { holidays: HolidayRecord[] };
  tasks: TaskRecord[];
  dependencies: DependencyRecord[];
  resources: ResourceRecord[];
  assignments: AssignmentRecord[];
  metrics: ProjectMetrics;
}

export interface ProjectMetrics {
  taskCount: number;
  leafCount: number;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  totalWorkingDays: number;
  totalCost: number;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserRecord;
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
};

export const DEPENDENCY_LABELS: Record<DependencyType, string> = {
  FS: 'Selesai → Mulai (FS)',
  SS: 'Mulai → Mulai (SS)',
};

export const WEEKDAY_LABELS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const;

export const WEEKDAY_SHORT_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;
