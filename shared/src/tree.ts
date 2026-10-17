export interface TreeTaskLike {
  id: string;
  parentId: string | null;
  position: number;
  startDate?: string;
}

export const MAX_TASK_DEPTH = 3;

export function sortTasks<T extends TreeTaskLike>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    const aStart = a.startDate ?? '';
    const bStart = b.startDate ?? '';
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function getChildrenMap<T extends TreeTaskLike>(
  tasks: readonly T[],
): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>();
  for (const task of sortTasks(tasks)) {
    const key = task.parentId;
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  return map;
}

export function getLeafIds(tasks: readonly TreeTaskLike[]): string[] {
  const parentIds = new Set(tasks.map((task) => task.parentId).filter((id): id is string => !!id));
  return tasks.filter((task) => !parentIds.has(task.id)).map((task) => task.id);
}

export function isSummaryTask(tasks: readonly TreeTaskLike[], id: string): boolean {
  return tasks.some((task) => task.parentId === id);
}

export function getTaskDepth(tasks: readonly TreeTaskLike[], id: string): number {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let depth = 1;
  let cursor = byId.get(id);
  const visited = new Set<string>();
  while (cursor?.parentId) {
    if (visited.has(cursor.id)) return Number.POSITIVE_INFINITY;
    visited.add(cursor.id);
    cursor = byId.get(cursor.parentId);
    depth += 1;
    if (depth > 100) return Number.POSITIVE_INFINITY;
  }
  return depth;
}

export function getDescendantIds(tasks: readonly TreeTaskLike[], id: string): string[] {
  const childrenMap = getChildrenMap(tasks);
  const result: string[] = [];
  const stack = [...(childrenMap.get(id) ?? [])].map((task) => task.id);
  while (stack.length > 0) {
    const current = stack.pop() as string;
    result.push(current);
    for (const child of childrenMap.get(current) ?? []) stack.push(child.id);
  }
  return result;
}

/** WBS: 1, 1.1, 1.1.1 berdasarkan urutan posisi saudara. */
export function buildWbsMap(tasks: readonly TreeTaskLike[]): Record<string, string> {
  const childrenMap = getChildrenMap(tasks);
  const result: Record<string, string> = {};

  const walk = (parentId: string | null, prefix: string, visited: Set<string>) => {
    const children = childrenMap.get(parentId) ?? [];
    children.forEach((task, index) => {
      if (visited.has(task.id)) return;
      visited.add(task.id);
      const wbs = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      result[task.id] = wbs;
      walk(task.id, wbs, visited);
    });
  };

  walk(null, '', new Set<string>());

  // Tugas dengan parent tidak valid tetap ditampilkan dengan penomoran cadangan.
  let fallback = 1;
  for (const task of sortTasks(tasks)) {
    if (!result[task.id]) {
      result[task.id] = `?${fallback}`;
      fallback += 1;
    }
  }
  return result;
}

export interface FlatTask<T> {
  task: T;
  depth: number;
  wbs: string;
  isSummary: boolean;
}

export function flattenTasks<T extends TreeTaskLike>(
  tasks: readonly T[],
  collapsedIds: ReadonlySet<string> = new Set(),
): FlatTask<T>[] {
  const childrenMap = getChildrenMap(tasks);
  const wbsMap = buildWbsMap(tasks);
  const result: FlatTask<T>[] = [];
  const visited = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    for (const task of childrenMap.get(parentId) ?? []) {
      if (visited.has(task.id)) continue;
      visited.add(task.id);
      const children = childrenMap.get(task.id) ?? [];
      result.push({
        task,
        depth,
        wbs: wbsMap[task.id] ?? '',
        isSummary: children.length > 0,
      });
      if (children.length > 0 && !collapsedIds.has(task.id)) {
        walk(task.id, depth + 1);
      }
    }
  };

  walk(null, 0);
  return result;
}
