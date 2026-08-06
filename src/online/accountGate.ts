/**
 * Whether the player may reach the game, or is still held at the account gate.
 *
 * The game is local-first: bosses, chores, fighters, coins, and rewards all live in
 * the on-device database, and an account exists only to share one household across
 * devices. Playing locally is therefore a supported mode rather than a fallback, and
 * the gate must let it through.
 */
export interface HouseholdConnection {
  householdId: string | null;
  configurationConnectedAt: string | null;
}

export function householdConnected(online: HouseholdConnection) {
  return Boolean(online.householdId && online.configurationConnectedAt);
}

export function playable(online: HouseholdConnection, localPlay: boolean) {
  return householdConnected(online) || localPlay;
}

export function showAccountGate(online: HouseholdConnection, localPlay: boolean) {
  return !playable(online, localPlay);
}
