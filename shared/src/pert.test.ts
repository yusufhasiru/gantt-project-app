import { describe, expect, it } from 'vitest';
import { computePert, isValidThreePoint, threePointEstimate } from './pert.js';

describe('PERT', () => {
  it('menghitung estimasi tiga titik dan variansi', () => {
    const result = threePointEstimate(8, 10, 15);
    expect(result.expectedDays).toBeCloseTo((8 + 40 + 15) / 6, 6);
    expect(result.variance).toBeCloseTo(Math.pow(7 / 6, 2), 6);
    expect(result.standardDeviation).toBeCloseTo(7 / 6, 6);
  });

  it('memvalidasi hubungan optimistis ≤ durasi ≤ pesimistis', () => {
    expect(isValidThreePoint(10, 8, 15)).toBe(true);
    expect(isValidThreePoint(10, null, 15)).toBe(false);
    expect(isValidThreePoint(10, 12, 15)).toBe(false);
    expect(isValidThreePoint(10, 8, 9)).toBe(false);
    expect(isValidThreePoint(10, 0, 15)).toBe(false);
  });

  it('menjumlahkan variansi hanya pada jalur kritis', () => {
    const tasks = [
      { id: 'a', durationDays: 4, optimisticDays: 2, pessimisticDays: 8 },
      { id: 'b', durationDays: 6, optimisticDays: 4, pessimisticDays: 10 },
      { id: 'c', durationDays: 3, optimisticDays: null, pessimisticDays: null },
    ];
    const result = computePert(tasks, ['a', 'b']);
    expect(result.available).toBe(true);
    // te(a) = (2 + 4*4 + 8) / 6 = 26/6; te(b) = (4 + 4*6 + 10) / 6 = 38/6.
    expect(result.projectExpectedDays).toBeCloseTo(26 / 6 + 38 / 6, 6);
    expect(result.projectVariance).toBeCloseTo(1 + 1, 6);
    expect(result.projectStandardDeviation).toBeCloseTo(Math.SQRT2, 6);
  });

  it('tidak menampilkan nilai palsu jika data estimasi tidak lengkap', () => {
    const tasks = [
      { id: 'a', durationDays: 4, optimisticDays: 2, pessimisticDays: 8 },
      { id: 'c', durationDays: 3, optimisticDays: null, pessimisticDays: null },
    ];
    const result = computePert(tasks, ['a', 'c']);
    expect(result.available).toBe(false);
    expect(result.projectExpectedDays).toBeNull();
    expect(result.projectVariance).toBeNull();
    expect(result.missingTaskIds).toEqual(['c']);
    expect(result.estimates).toHaveLength(1);
  });
});
