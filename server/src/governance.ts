export type GovernanceRole = 'owner' | 'parent' | 'member' | 'child';

export function assertCanManageMembership(input: {
  actorUserId: string;
  actorRole: GovernanceRole;
  targetUserId: string;
  targetRole: GovernanceRole;
  removingAccess: boolean;
  activeOwnerCount: number;
}) {
  if (input.actorUserId === input.targetUserId) throw new Error('Cannot administer your own membership');
  if (input.actorRole !== 'owner' && input.actorRole !== 'parent') throw new Error('Forbidden');
  if (input.actorRole === 'parent' && (input.targetRole === 'owner' || input.targetRole === 'parent')) {
    throw new Error('Parents cannot administer owners or other parents');
  }
  if (input.removingAccess && input.targetRole === 'owner' && input.activeOwnerCount <= 1) {
    throw new Error('Household must retain an active owner');
  }
}
