import type {
  CalendarConfig,
  CpmResult,
  CostBreakdown,
  HolidayRecord,
  PertResult,
  ProjectMetrics,
  ProjectRecord,
  WorkloadSummary,
} from '@gantt/shared';

export interface ProjectSummary extends ProjectRecord {
  holidays: HolidayRecord[];
  metrics: ProjectMetrics;
}

export interface AnalysisResponse {
  metrics: ProjectMetrics;
  calendar: CalendarConfig;
  projectStart: string;
  cpm: CpmResult;
  pert: PertResult;
  primaryCriticalPath: string[];
  cost: CostBreakdown;
  workload: WorkloadSummary;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
}
