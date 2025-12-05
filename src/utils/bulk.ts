import { BeadItemData } from './beads';

export interface BulkSelectionResult {
  ids: string[];
  error?: string;
}

export interface BulkOperationFailure {
  id: string;
  error: string;
}

export interface BulkOperationResult {
  successes: string[];
  failures: BulkOperationFailure[];
}

export function buildBulkSelection(beads: BeadItemData[], maxSelection: number): BulkSelectionResult {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const bead of beads) {
    const id = bead?.id?.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }

  if (ids.length === 0) {
    return { ids, error: 'No beads selected' };
  }

  if (ids.length > maxSelection) {
    return {
      ids,
      error: `Selection exceeds maximum of ${maxSelection}`,
    };
  }

  return { ids };
}

export async function executeBulkStatusUpdate(
  ids: string[],
  status: string,
  runner: (id: string) => Promise<void>,
  onProgress?: (completed: number, total: number) => void
): Promise<BulkOperationResult> {
  const successes: string[] = [];
  const failures: BulkOperationFailure[] = [];
  const total = ids.length;
  let completed = 0;

  for (const id of ids) {
    try {
      await runner(id);
      successes.push(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id, error: message });
    } finally {
      completed += 1;
      onProgress?.(completed, total);
    }
  }

  return { successes, failures };
}

export type BulkLabelAction = 'add' | 'remove';

export async function executeBulkLabelUpdate(
  ids: string[],
  _label: string,
  _action: BulkLabelAction,
  runner: (id: string) => Promise<void>,
  onProgress?: (completed: number, total: number) => void
): Promise<BulkOperationResult> {
  // Reuse status bulk helper; semantics identical for progress/failure handling
  return executeBulkStatusUpdate(ids, _label, runner, onProgress);
}
