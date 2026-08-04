export type RedemptionStatus = 'active' | 'used' | 'cancelled';

export function assertRedemptionManagerRole(role: unknown) {
  if (role !== 'owner' && role !== 'parent') throw new Error('Forbidden');
}

export function assertRedemptionFunds(balance: unknown, cost: unknown) {
  if (!Number.isSafeInteger(Number(cost)) || Number(cost) < 0 || Number(balance) < Number(cost)) {
    throw new Error('Insufficient wallet balance');
  }
}

export function requestedRedemptionStatus(value: unknown): 'used' | 'cancelled' {
  if (value !== 'used' && value !== 'cancelled') {
    throw new Error('Unsupported redemption status');
  }
  return value;
}

export function redemptionTransition(current: unknown, requested: 'used' | 'cancelled'): 'duplicate' | 'transition' {
  if (current === requested) return 'duplicate';
  if (current === 'active') return 'transition';
  throw new Error(`Cannot transition redemption from ${String(current)} to ${requested}`);
}

export function initialRedemption() {
  return { status: 'active' as const, approvedByUserId: null };
}
