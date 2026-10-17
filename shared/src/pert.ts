export interface PertInputTask {
  id: string;
  name?: string;
  durationDays: number;
  optimisticDays: number | null;
  pessimisticDays: number | null;
}

export interface PertTaskEstimate {
  id: string;
  name: string;
  optimisticDays: number;
  mostLikelyDays: number;
  pessimisticDays: number;
  expectedDays: number;
  variance: number;
  standardDeviation: number;
}

export interface PertResult {
  available: boolean;
  estimates: PertTaskEstimate[];
  missingTaskIds: string[];
  criticalPathIds: string[];
  projectExpectedDays: number | null;
  projectVariance: number | null;
  projectStandardDeviation: number | null;
  assumption: string;
}

export const PERT_ASSUMPTION =
  'Variansi sepanjang jalur kritis dijumlahkan dengan asumsi aktivitas saling independen; simpangan baku adalah akar dari total variansi.';

export function isValidThreePoint(
  durationDays: number,
  optimisticDays: number | null | undefined,
  pessimisticDays: number | null | undefined,
): boolean {
  if (optimisticDays === null || optimisticDays === undefined) return false;
  if (pessimisticDays === null || pessimisticDays === undefined) return false;
  return (
    Number.isInteger(optimisticDays) &&
    Number.isInteger(pessimisticDays) &&
    optimisticDays >= 1 &&
    optimisticDays <= durationDays &&
    pessimisticDays >= durationDays
  );
}

export function threePointEstimate(
  optimisticDays: number,
  mostLikelyDays: number,
  pessimisticDays: number,
): { expectedDays: number; variance: number; standardDeviation: number } {
  const expectedDays = (optimisticDays + 4 * mostLikelyDays + pessimisticDays) / 6;
  const variance = Math.pow((pessimisticDays - optimisticDays) / 6, 2);
  return {
    expectedDays,
    variance,
    standardDeviation: Math.sqrt(variance),
  };
}

/**
 * Estimasi PERT. Nilai proyek hanya tersedia jika seluruh tugas pada jalur kritis
 * memiliki estimasi optimistis dan pesimistis yang valid.
 */
export function computePert(
  tasks: readonly PertInputTask[],
  criticalIds: readonly string[],
): PertResult {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const estimates: PertTaskEstimate[] = [];
  const invalidIds: string[] = [];

  for (const task of tasks) {
    if (!isValidThreePoint(task.durationDays, task.optimisticDays, task.pessimisticDays)) {
      invalidIds.push(task.id);
      continue;
    }
    const raw = threePointEstimate(
      task.optimisticDays as number,
      task.durationDays,
      task.pessimisticDays as number,
    );
    estimates.push({
      id: task.id,
      name: task.name ?? task.id,
      optimisticDays: task.optimisticDays as number,
      mostLikelyDays: task.durationDays,
      pessimisticDays: task.pessimisticDays as number,
      expectedDays: raw.expectedDays,
      variance: raw.variance,
      standardDeviation: raw.standardDeviation,
    });
  }

  const criticalEstimates = criticalIds
    .map((id) => estimates.find((estimate) => estimate.id === id))
    .filter((estimate): estimate is PertTaskEstimate => !!estimate);
  const criticalComplete =
    criticalIds.length > 0 &&
    criticalIds.every((id) => byId.has(id)) &&
    criticalEstimates.length === criticalIds.length;

  if (!criticalComplete) {
    return {
      available: false,
      estimates,
      missingTaskIds: criticalIds.filter(
        (id) => !estimates.some((estimate) => estimate.id === id),
      ),
      criticalPathIds: [...criticalIds],
      projectExpectedDays: null,
      projectVariance: null,
      projectStandardDeviation: null,
      assumption: PERT_ASSUMPTION,
    };
  }

  const projectExpectedDays = criticalEstimates.reduce(
    (sum, estimate) => sum + estimate.expectedDays,
    0,
  );
  const projectVariance = criticalEstimates.reduce(
    (sum, estimate) => sum + estimate.variance,
    0,
  );

  return {
    available: true,
    estimates,
    missingTaskIds: invalidIds,
    criticalPathIds: [...criticalIds],
    projectExpectedDays,
    projectVariance,
    projectStandardDeviation: Math.sqrt(projectVariance),
    assumption: PERT_ASSUMPTION,
  };
}
