import type { PendingMutation, SyncMutationResult } from './api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A redemption row is created by the server under its mutation's id, so an optimistic
 * voucher adopts that id and both sides agree from the start. Vouchers created before
 * that — and vouchers created while the household is local-only — still need an id.
 */
export function voucherId() {
  return crypto.randomUUID();
}

/** Whether a voucher id can address a server redemption. */
export function isVoucherId(value: string) {
  return uuidPattern.test(value);
}

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
