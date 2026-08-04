import type { PendingMutation, SyncMutationResult } from './api';

export function sendableMutations(mutations: PendingMutation[], householdId: string) {
  return mutations.filter((mutation) => mutation.householdId === householdId && !mutation.rejectedAt);
}

export function applyMutationResults(
  mutations: PendingMutation[],
  householdId: string,
  results: SyncMutationResult[],
  rejectedAt: string,
) {
  const byId = new Map(results.map((result) => [result.id, result]));
  return mutations.flatMap((mutation) => {
    if (mutation.householdId !== householdId || mutation.rejectedAt) return [mutation];
    const result = byId.get(mutation.id);
    if (!result) return [mutation];
    if (result.outcome === 'accepted' || result.outcome === 'duplicate') return [];
    return [{
      ...mutation,
      attempts: mutation.attempts + 1,
      lastError: result.error ?? result.code ?? 'Mutation rejected',
      rejectedAt,
      rejectionCode: result.code ?? result.outcome,
    }];
  });
}
