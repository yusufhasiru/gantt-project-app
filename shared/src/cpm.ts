import { nextWorkingDay, workingDayOrdinal, workingDaysBetween } from './calendar.js';
import { DomainError } from './errors.js';
import { topologicalOrder } from './scheduler.js';
import type { CalendarConfig, DependencyInput } from './types.js';

export interface CpmInputTask {
  id: string;
  name?: string;
  durationDays: number;
  scheduledStart: string;
  scheduledEnd: string;
}

export interface CpmTaskRow {
  id: string;
  name: string;
  durationDays: number;
  scheduledStart: string;
  scheduledEnd: string;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  critical: boolean;
}

export interface CpmResult {
  tasks: CpmTaskRow[];
  criticalIds: string[];
  criticalPaths: string[][];
  projectEndOrdinal: number;
  projectEndDate: string;
  totalWorkingDays: number;
  ordinalBase: string;
  hasNegativeFloat: boolean;
}

/**
 * CPM pada tugas daun dengan ordinal hari kerja.
 * Ordinal 0 adalah hari kerja pertama pada/setelah tanggal mulai proyek.
 * Asumsi: seluruh tugas memiliki jadwal yang sudah konsisten dengan kalender.
 */
export function computeCpm(
  tasks: readonly CpmInputTask[],
  dependencies: readonly DependencyInput[],
  projectStart: string,
  calendar: CalendarConfig,
): CpmResult {
  const leafIds = new Set(tasks.map((task) => task.id));
  if (tasks.length === 0) {
    return {
      tasks: [],
      criticalIds: [],
      criticalPaths: [],
      projectEndOrdinal: 0,
      projectEndDate: nextWorkingDay(projectStart, calendar),
      totalWorkingDays: 0,
      ordinalBase: nextWorkingDay(projectStart, calendar),
      hasNegativeFloat: false,
    };
  }

  const validDeps = dependencies.filter(
    (dep) => leafIds.has(dep.predecessorId) && leafIds.has(dep.successorId),
  );
  const order = topologicalOrder(tasks.map((task) => task.id), validDeps);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ordinalBase = nextWorkingDay(projectStart, calendar);

  type Working = CpmTaskRow;
  const rows = new Map<string, Working>();

  for (const id of order) {
    const task = byId.get(id) as CpmInputTask;
    const start = nextWorkingDay(task.scheduledStart, calendar);
    const es = workingDayOrdinal(start, projectStart, calendar);
    const ef = es + task.durationDays - 1;
    rows.set(id, {
      id,
      name: task.name ?? id,
      durationDays: task.durationDays,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd,
      es,
      ef,
      ls: 0,
      lf: 0,
      totalFloat: 0,
      critical: false,
    });
  }

  const projectEndOrdinal = Math.max(...[...rows.values()].map((row) => row.ef));
  const projectEndDate = taskEndDateFromOrdinal(rows, calendar) ?? ordinalBase;

  const outgoing = new Map<string, DependencyInput[]>();
  for (const dep of validDeps) {
    const list = outgoing.get(dep.predecessorId) ?? [];
    list.push(dep);
    outgoing.set(dep.predecessorId, list);
  }

  for (const id of [...order].reverse()) {
    const row = rows.get(id) as Working;
    const successors = outgoing.get(id) ?? [];
    let lf = projectEndOrdinal;
    if (successors.length > 0) {
      lf = Number.POSITIVE_INFINITY;
      for (const dep of successors) {
        const successor = rows.get(dep.successorId);
        if (!successor) continue;
        const candidate =
          dep.type === 'FS'
            ? successor.ls - 1 - dep.lagDays
            : successor.ls - dep.lagDays + row.durationDays - 1;
        lf = Math.min(lf, candidate);
      }
      if (!Number.isFinite(lf)) lf = projectEndOrdinal;
    }
    row.lf = lf;
    row.ls = lf - row.durationDays + 1;
    row.totalFloat = row.ls - row.es;
    row.critical = row.totalFloat === 0;
  }

  // Validasi konsistensi: ES harus sama dengan perhitungan maju dari dependensi.
  for (const dep of validDeps) {
    const pred = rows.get(dep.predecessorId) as Working;
    const succ = rows.get(dep.successorId) as Working;
    const expected =
      dep.type === 'FS' ? pred.ef + 1 + dep.lagDays : pred.es + dep.lagDays;
    if (succ.es < expected) {
      throw new DomainError(
        'CPM_ERROR',
        `Jadwal tidak konsisten untuk dependensi ${pred.id} → ${succ.id}.`,
      );
    }
  }

  const criticalIds = [...rows.values()]
    .filter((row) => row.critical)
    .sort((a, b) => a.es - b.es)
    .map((row) => row.id);

  const hasNegativeFloat = [...rows.values()].some((row) => row.totalFloat < 0);
  const criticalPaths = buildCriticalPaths(rows, validDeps);

  return {
    tasks: [...rows.values()].sort((a, b) => a.es - b.es),
    criticalIds,
    criticalPaths,
    projectEndOrdinal,
    projectEndDate,
    totalWorkingDays: workingDaysBetween(ordinalBase, projectEndDate, calendar),
    ordinalBase,
    hasNegativeFloat,
  };
}

function taskEndDateFromOrdinal(
  rows: Map<string, CpmTaskRow>,
  calendar: CalendarConfig,
): string | null {
  let best: CpmTaskRow | null = null;
  for (const row of rows.values()) {
    if (!best || row.ef > best.ef) best = row;
  }
  if (!best) return null;
  return nextWorkingDay(best.scheduledEnd, calendar);
}

function buildCriticalPaths(
  rows: Map<string, CpmTaskRow>,
  dependencies: readonly DependencyInput[],
): string[][] {
  const criticalEdges: Array<{ from: string; to: string }> = [];
  const incomingCritical = new Set<string>();
  const outgoingCritical = new Set<string>();

  for (const dep of dependencies) {
    const pred = rows.get(dep.predecessorId);
    const succ = rows.get(dep.successorId);
    if (!pred?.critical || !succ?.critical) continue;
    const binding =
      dep.type === 'FS'
        ? succ.es === pred.ef + 1 + dep.lagDays
        : succ.es === pred.es + dep.lagDays;
    if (!binding) continue;
    criticalEdges.push({ from: pred.id, to: succ.id });
    incomingCritical.add(succ.id);
    outgoingCritical.add(pred.id);
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of criticalEdges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }

  const criticalNodes = [...rows.values()].filter((row) => row.critical).map((row) => row.id);
  const sources = criticalNodes.filter((id) => !incomingCritical.has(id));
  const paths: string[][] = [];
  const maxPaths = 50;

  const dfs = (node: string, path: string[], seen: Set<string>) => {
    if (paths.length >= maxPaths) return;
    const next = (adjacency.get(node) ?? []).filter((id) => !seen.has(id));
    if (next.length === 0) {
      if (path.length > 0) paths.push([...path]);
      return;
    }
    for (const child of next) {
      seen.add(child);
      path.push(child);
      dfs(child, path, seen);
      path.pop();
      seen.delete(child);
    }
  };

  for (const source of sources) {
    dfs(source, [source], new Set([source]));
    if (paths.length >= maxPaths) break;
  }

  // Tugas kritis tanpa dependensi kritis yang terhubung tetap dilaporkan.
  if (paths.length === 0) {
    for (const id of criticalNodes) paths.push([id]);
  }

  return paths.sort((a, b) => {
    const aRow = rows.get(a[0]);
    const bRow = rows.get(b[0]);
    return (aRow?.es ?? 0) - (bRow?.es ?? 0);
  });
}
