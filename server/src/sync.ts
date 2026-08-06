export type MutationOutcome = 'accepted' | 'duplicate' | 'conflict' | 'rejected';

export function mutationError(error: unknown): { outcome: 'conflict' | 'rejected'; code: string; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'Configuration revision conflict') {
    return { outcome: 'conflict', code: 'configuration_revision_conflict', error: message };
  }
  return { outcome: 'rejected', code: 'mutation_rejected', error: message };
}

export function expectedRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('expectedRevision must be a non-negative integer');
  }
  return Number(value);
}

export function boundedRows<T>(rows: T[], limit: number) {
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}
