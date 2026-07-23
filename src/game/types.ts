export type Lang = 'no' | 'en';

export type TriggerType = 'alltid' | 'daglig' | 'ukentlig' | 'månedlig' | 'sjelden';

export interface Trigger {
  type: TriggerType;
  /** 0 = Sunday … 6 = Saturday, for weekly triggers. */
  day?: number;
  /** Day of month (1–28), for monthly triggers. */
  date?: number;
  note?: string;
}

/** A chore = an attack the family can perform against a boss. */
export interface Chore {
  id: string;
  title: string;
  damage: number;
  /** Repeatable chores can be tapped many times per cycle. */
  repeatable: boolean;
}

export interface Boss {
  id: string;
  name: string;
  sprite: string;
  /** > 0 marks a horizontal sprite-sheet animation with this many frames. */
  frames: number;
  rare: boolean;
  trigger: Trigger;
  chores: Chore[];
  /** Remaining HP for the current cycle. */
  hp: number;
  /** Cycle key this boss was last cleared in (empty = not cleared). */
  clearedCycle: string;
  /** Ids of used (non-repeatable) chores in the current cycle. */
  usedChores: string[];
  /** Asleep: hidden from the roster and schedule until awakened. */
  dormant: boolean;
  /** Family victory count that auto-awakens a dormant boss (0 = never on its own). */
  unlockAt: number;
  /** Optional permanent hue-rotation (deg) for palette-swapped sprite variants. */
  hue?: number;
}

export interface Fighter {
  id: string;
  name: string;
  color: string;
  /** Optional data-URL avatar. */
  avatar?: string;
  streak: number;
  coins: number;
  /** Lifetime XP (damage dealt), drives the level curve. */
  careerXp: number;
}

/** A single attack recorded during the current battle cycle. */
export interface LogEntry {
  bossId: string;
  fighterId: string;
  attack: string;
  damage: number;
}

/** A redeemed reward voucher, held until "used". */
export interface Redemption {
  vid: string;
  icon: string;
  title: string;
  cost: number;
  at: string;
  who: string;
  used: boolean;
}

export interface Settings {
  lang: Lang;
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
}

/** Static catalog reward (not user-editable). */
export interface RewardDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  cost: number;
}

export type Tab = 'home' | 'party' | 'battle' | 'rewards' | 'inv';
export type Phase = 'splash' | 'onboarding' | 'app';

export interface GameState {
  bosses: Boss[];
  fighters: Fighter[];
  log: LogEntry[];
  redemptions: Redemption[];
  settings: Settings;
  activeFighterId: string | null;
  currentBossId: string;
  pool: number;
  victories: number;
  goldenRevealed: boolean;
  onboarded: boolean;
}
