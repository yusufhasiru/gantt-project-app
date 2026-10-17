import { describe, expect, it } from 'vitest';
import {
  buildWbsMap,
  flattenTasks,
  getDescendantIds,
  getLeafIds,
  getTaskDepth,
} from './tree.js';

const tasks = [
  { id: 'root', parentId: null, position: 0 },
  { id: 'a', parentId: 'root', position: 0 },
  { id: 'a1', parentId: 'a', position: 0 },
  { id: 'b', parentId: 'root', position: 1 },
  { id: 'other', parentId: null, position: 1 },
];

describe('struktur tugas', () => {
  it('membangun penomoran WBS hierarkis', () => {
    expect(buildWbsMap(tasks)).toEqual({
      root: '1',
      a: '1.1',
      a1: '1.1.1',
      b: '1.2',
      other: '2',
    });
  });

  it('menentukan tugas daun', () => {
    expect(getLeafIds(tasks).sort()).toEqual(['a1', 'b', 'other']);
  });

  it('menghitung kedalaman dan keturunan', () => {
    expect(getTaskDepth(tasks, 'root')).toBe(1);
    expect(getTaskDepth(tasks, 'a1')).toBe(3);
    expect(getDescendantIds(tasks, 'root').sort()).toEqual(['a', 'a1', 'b']);
  });

  it('meratakan struktur dan menghormati collapse', () => {
    const flat = flattenTasks(tasks);
    expect(flat.map((item) => item.task.id)).toEqual(['root', 'a', 'a1', 'b', 'other']);
    expect(flat.find((item) => item.task.id === 'root')?.isSummary).toBe(true);
    expect(flat.find((item) => item.task.id === 'a1')?.depth).toBe(2);

    const collapsed = flattenTasks(tasks, new Set(['root']));
    expect(collapsed.map((item) => item.task.id)).toEqual(['root', 'other']);
  });
});
