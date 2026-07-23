import type { Boss, Chore, RewardDef, Trigger } from './types';

/** Sprite paths as served from /public. */
export const SPRITE = {
  laundry: '/sprites/laundry_dragon.webp',
  socks: '/uploads/sock-void-boss-transparent.png',
  dishes: '/uploads/dish-hydra-boss-transparent.png',
  fridge: '/uploads/fridge-rot-colossus-boss-transparent.png',
  crumb: '/uploads/crumb-colossus-boss-transparent.png',
  toys: '/uploads/toyquake-titan-boss-transparent.png',
  paper: '/uploads/paper-kraken-boss-transparent.png',
  trash: '/uploads/trash-heap-behemoth-boss-transparent.png',
  mirror: '/uploads/mirror-smudge-phantom-boss-transparent.png',
  backpack: '/uploads/backpack-avalanche-boss-transparent.png',
  schedule: '/uploads/schedule-specter-boss-transparent.png',
  cable: '/uploads/cable-serpent-boss-transparent.png',
  golem: '/uploads/chore-golem-boss-transparent.png',
  todo: '/uploads/todo-swarm-boss-transparent.png',
  golden: '/uploads/the-golden-done-idle-sprite-sheet-transparent.png',
  laundryElite: '/uploads/laundry-dragon-elite-transparent.webp',
} as const;

/**
 * Bespoke "enraged" art keyed by base sprite. When a boss using one of these
 * sprites rolls elite for the cycle, we swap in the dedicated art instead of the
 * generic red CSS tint. Keyed by sprite (not boss id) so it also covers parent-
 * created bosses that pick the same sprite, and existing saves, with no migration.
 */
export const ELITE_SPRITE: Record<string, string> = {
  [SPRITE.laundry]: SPRITE.laundryElite,
};

/** The dedicated enraged sprite for a boss, if one exists for its base sprite. */
export function eliteSpriteFor(boss: { sprite: string }): string | undefined {
  return ELITE_SPRITE[boss.sprite];
}

/** Pool of sprites cycled through in the boss manager. */
export const SPRITE_POOL: string[] = [
  SPRITE.laundry,
  SPRITE.dishes,
  SPRITE.toys,
  SPRITE.paper,
  SPRITE.socks,
  SPRITE.fridge,
  SPRITE.crumb,
  SPRITE.trash,
  SPRITE.mirror,
  SPRITE.backpack,
  SPRITE.schedule,
  SPRITE.cable,
  SPRITE.golem,
  SPRITE.todo,
];

export const FIGHTER_COLORS = [
  '#F4B942', '#E0564A', '#67D391', '#5B9BE8',
  '#B57BE0', '#5FD0C8', '#EE8FB0', '#E8A44C',
];

interface SeedBoss {
  id: string;
  name: string;
  sprite: string;
  frames?: number;
  rare?: boolean;
  trigger: Trigger;
  attacks: { title: string; damage: number }[];
  /** Starts asleep — hidden until awakened by victories (or a parent). */
  dormant?: boolean;
  /** Family victory count that wakes this dormant boss. */
  unlockAt?: number;
  /** Permanent hue-rotation (deg) for a palette-swapped sprite variant. */
  hue?: number;
}

const SEED_BOSSES: SeedBoss[] = [
  { id: 'laundry', name: 'Vaskedragen', sprite: SPRITE.laundry, trigger: { type: 'daglig', note: 'Vaskedag' },
    attacks: [
      { title: 'Start en vask', damage: 12 }, { title: 'Heng opp klær', damage: 18 }, { title: 'Brett bunken', damage: 28 },
      { title: 'Par sokkene', damage: 14 }, { title: 'Legg bort klær', damage: 32 }, { title: 'Fjern gulvsokker', damage: 16 },
    ] },
  { id: 'socks', name: 'Sokkesluket', sprite: SPRITE.socks, dormant: true, unlockAt: 6, trigger: { type: 'ukentlig', day: 0, note: 'Sorter matchende sokker' },
    attacks: [
      { title: 'Finn løse sokker', damage: 14 }, { title: 'Par opp sokker', damage: 22 }, { title: 'Legg i skuffen', damage: 16 },
      { title: 'Kast hullete sokker', damage: 12 }, { title: 'Tøm skittentøyet', damage: 26 },
    ] },
  { id: 'dishes', name: 'Oppvaskhydraen', sprite: SPRITE.dishes, trigger: { type: 'daglig', note: 'Etter middag' },
    attacks: [
      { title: 'Skrap tallerkener', damage: 12 }, { title: 'Fyll oppvaskmaskinen', damage: 20 }, { title: 'Skrubb pannene', damage: 30 },
      { title: 'Tørk og stable', damage: 16 }, { title: 'Tørk benkene', damage: 14 }, { title: 'Tøm stativet', damage: 34 },
    ] },
  { id: 'fridge', name: 'Kjøleskapsråten', sprite: SPRITE.fridge, dormant: true, unlockAt: 18, trigger: { type: 'ukentlig', day: 6, note: 'Storrengjøring' },
    attacks: [
      { title: 'Kast utgått mat', damage: 16 }, { title: 'Sjekk datoer', damage: 14 }, { title: 'Tørk hyllene', damage: 24 },
      { title: 'Vask grønnsaksskuffen', damage: 28 }, { title: 'Kast muggen rest', damage: 18 }, { title: 'Tørk søl', damage: 12 },
    ] },
  { id: 'crumb', name: 'Smulekolossen', sprite: SPRITE.crumb, dormant: true, unlockAt: 2, trigger: { type: 'daglig', note: 'Etter måltid' },
    attacks: [
      { title: 'Kost opp smuler', damage: 16 }, { title: 'Tørk bordet', damage: 14 }, { title: 'Rist duken', damage: 12 },
      { title: 'Støvsug under bordet', damage: 26 }, { title: 'Tøm brødristeren', damage: 18 },
    ] },
  { id: 'toys', name: 'Lekekjempen', sprite: SPRITE.toys, trigger: { type: 'daglig', note: 'Før leggetid' },
    attacks: [
      { title: 'Kast i kassen', damage: 14 }, { title: 'Sorter klossene', damage: 18 }, { title: 'Redd bortkomne biter', damage: 16 },
      { title: 'Stable spillene', damage: 12 }, { title: 'Rydd gulvet', damage: 30 }, { title: 'Pakk gi-bort-ting', damage: 36 },
    ] },
  { id: 'paper', name: 'Papirkraken', sprite: SPRITE.paper, dormant: true, unlockAt: 30, trigger: { type: 'månedlig', date: 1, note: 'Regningsdag' },
    attacks: [
      { title: 'Åpne posten', damage: 12 }, { title: 'Sorter regninger', damage: 18 }, { title: 'Arkiver kvitteringer', damage: 16 },
      { title: 'Makuler gammelt', damage: 20 }, { title: 'Betal regningene', damage: 34 }, { title: 'Tøm innboksen', damage: 38 },
    ] },
  { id: 'trash', name: 'Søppelbehemoten', sprite: SPRITE.trash, trigger: { type: 'ukentlig', day: 4, note: 'Søppeldag' },
    attacks: [
      { title: 'Knyt igjen posene', damage: 14 }, { title: 'Bær ut restavfall', damage: 20 }, { title: 'Sorter pant', damage: 16 },
      { title: 'Tøm papir og plast', damage: 22 }, { title: 'Skyll og kast glass', damage: 18 }, { title: 'Trill dunken til veien', damage: 30 },
    ] },
  { id: 'mirror', name: 'Speilspøkelset', sprite: SPRITE.mirror, dormant: true, unlockAt: 9, trigger: { type: 'ukentlig', day: 3, note: 'Baderomsvask' },
    attacks: [
      { title: 'Puss speilet blankt', damage: 18 }, { title: 'Skrubb vasken', damage: 22 }, { title: 'Rens kranen', damage: 14 },
      { title: 'Tørk flisene', damage: 20 }, { title: 'Vask toalettet', damage: 28 }, { title: 'Bytt håndklær', damage: 16 },
    ] },
  { id: 'backpack', name: 'Sekkeskredet', sprite: SPRITE.backpack, dormant: true, unlockAt: 4, trigger: { type: 'daglig', note: 'Etter skolen' },
    attacks: [
      { title: 'Heng opp sekken', damage: 14 }, { title: 'Tøm matboksen', damage: 18 }, { title: 'Sett skoene på plass', damage: 12 },
      { title: 'Heng opp yttertøy', damage: 16 }, { title: 'Pakk til i morgen', damage: 24 }, { title: 'Rydd gangen', damage: 26 },
    ] },
  { id: 'golden', name: 'Den Gylne Gjøremesteren', sprite: SPRITE.golden, frames: 6, rare: true, trigger: { type: 'sjelden', note: 'Dukker opp når minst man venter' },
    attacks: [
      { title: 'Bøn hele huset', damage: 40 }, { title: 'Vask vinduene', damage: 34 }, { title: 'Støvsug alle rom', damage: 36 },
      { title: 'Vask badet', damage: 44 }, { title: 'Skift alle sengetøy', damage: 38 }, { title: 'Rydd og tøm søpla', damage: 30 },
    ] },
];

// Newer bosses — kept separate so a migration can add them to existing saves.
const EXTRA_BOSSES: SeedBoss[] = [
  { id: 'schedule', name: 'Kalendergjenferdet', sprite: SPRITE.schedule, dormant: true, unlockAt: 22, trigger: { type: 'månedlig', date: 15, note: 'Planleggingsdag' },
    attacks: [
      { title: 'Planlegg uka', damage: 16 }, { title: 'Book legetimer', damage: 18 }, { title: 'Sett opp middagsplan', damage: 22 },
      { title: 'Meld på aktiviteter', damage: 20 }, { title: 'Synk kalenderen', damage: 14 }, { title: 'Betal faste regninger', damage: 34 },
    ] },
  { id: 'cable', name: 'Kabelslangen', sprite: SPRITE.cable, dormant: true, unlockAt: 15, trigger: { type: 'ukentlig', day: 5, note: 'Teknologirydding' },
    attacks: [
      { title: 'Kveil opp ledninger', damage: 14 }, { title: 'Samle løse ladere', damage: 16 }, { title: 'Merk kablene', damage: 18 },
      { title: 'Lad alle enheter', damage: 12 }, { title: 'Rydd skrivebordet', damage: 24 }, { title: 'Koble fra ubrukte', damage: 20 },
    ] },
  { id: 'golem', name: 'Gjøremålsgolemen', sprite: SPRITE.golem, dormant: true, unlockAt: 26, trigger: { type: 'ukentlig', day: 1, note: 'Storrydding' },
    attacks: [
      { title: 'Rydd hvert rom', damage: 20 }, { title: 'Ta all vasken', damage: 30 }, { title: 'Tøm all søpla', damage: 24 },
      { title: 'Støvsug hele huset', damage: 34 }, { title: 'Vask badet', damage: 32 }, { title: 'Skift alt sengetøy', damage: 36 },
    ] },
  { id: 'todo', name: 'Huskelistehæren', sprite: SPRITE.todo, dormant: true, unlockAt: 12, trigger: { type: 'daglig', note: 'Dagens liste' },
    attacks: [
      { title: 'Kryss av én ting', damage: 12 }, { title: 'Ta den minste jobben', damage: 14 }, { title: 'Gjør det du utsetter', damage: 22 },
      { title: 'Rydd én overflate', damage: 16 }, { title: 'Fullfør en påbegynt ting', damage: 20 }, { title: 'Rydd fem ting', damage: 18 },
    ] },

  // Palette-swapped "variant" bosses — same silhouette, a hue shift and a
  // fresh theme/schedule. They slumber deep into the campaign as late surprises.
  { id: 'frost', name: 'Frostvaskedragen', sprite: SPRITE.laundry, hue: 180, dormant: true, unlockAt: 34, trigger: { type: 'månedlig', date: 3, note: 'Tekstilvask' },
    attacks: [
      { title: 'Vask én maskin', damage: 12 }, { title: 'Vask sengetøy', damage: 24 }, { title: 'Vask gardinene', damage: 22 },
      { title: 'Rens teppene', damage: 26 }, { title: 'Vask dyner og puter', damage: 30 }, { title: 'Vask yttertøy', damage: 18 },
    ] },
  { id: 'mold', name: 'Grønnmugghydraen', sprite: SPRITE.dishes, hue: 110, dormant: true, unlockAt: 38, trigger: { type: 'ukentlig', day: 2, note: 'Kjøkkendypvask' },
    attacks: [
      { title: 'Tørk en flate', damage: 12 }, { title: 'Skrubb komfyren', damage: 28 }, { title: 'Rens vasken', damage: 20 },
      { title: 'Tøm og vask kjøleskapet', damage: 32 }, { title: 'Vask mikroen', damage: 16 }, { title: 'Tørk av viften', damage: 22 },
    ] },
  { id: 'shadow', name: 'Skyggekraken', sprite: SPRITE.paper, hue: 265, dormant: true, unlockAt: 44, trigger: { type: 'månedlig', date: 20, note: 'Digital opprydding' },
    attacks: [
      { title: 'Slett 10 bilder', damage: 12 }, { title: 'Rydd nedlastinger', damage: 18 }, { title: 'Tøm søppelmappa', damage: 16 },
      { title: 'Avslutt et abonnement', damage: 26 }, { title: 'Rydd innboksen', damage: 30 }, { title: 'Ta en backup', damage: 22 },
    ] },
  { id: 'nightswarm', name: 'Nattsvermen', sprite: SPRITE.todo, hue: 305, dormant: true, unlockAt: 50, trigger: { type: 'ukentlig', day: 0, note: 'Kveldsreset' },
    attacks: [
      { title: 'Rydd én ting', damage: 10 }, { title: 'Legg klær i kurven', damage: 14 }, { title: 'Sett fram til i morgen', damage: 18 },
      { title: 'Tøm oppvaskkummen', damage: 22 }, { title: 'Slukk og lad', damage: 12 }, { title: 'Rydd stua før senga', damage: 28 },
    ] },
  { id: 'rust', name: 'Rustkolossen', sprite: SPRITE.trash, hue: 210, dormant: true, unlockAt: 58, trigger: { type: 'månedlig', date: 8, note: 'Bod og garasje' },
    attacks: [
      { title: 'Rydd én hylle', damage: 14 }, { title: 'Sorter verktøy', damage: 20 }, { title: 'Kast det ødelagte', damage: 24 },
      { title: 'Feie gulvet', damage: 18 }, { title: 'Organiser boden', damage: 30 }, { title: 'Kjør til gjenbruk', damage: 34 },
    ] },
];

/** Every boss the game seeds on a fresh install. */
const ALL_SEED_BOSSES: SeedBoss[] = [...SEED_BOSSES, ...EXTRA_BOSSES];

export function sumDamage(chores: Chore[]): number {
  return chores.reduce((s, c) => s + (Number(c.damage) || 0), 0);
}

function buildBoss(b: SeedBoss): Boss {
  const chores: Chore[] = b.attacks.map((a, i) => ({
    id: `${b.id}-${i}`,
    title: a.title,
    damage: a.damage,
    repeatable: i === 0,
  }));
  return {
    id: b.id,
    name: b.name,
    sprite: b.sprite,
    frames: b.frames ?? 0,
    rare: !!b.rare,
    trigger: { ...b.trigger },
    chores,
    hp: sumDamage(chores),
    clearedCycle: '',
    usedChores: [],
    dormant: !!b.dormant,
    unlockAt: b.unlockAt ?? 0,
    hue: b.hue,
  };
}

/** Build the initial boss list with derived HP and chore ids. */
export function seedBosses(): Boss[] {
  return ALL_SEED_BOSSES.map(buildBoss);
}

/** Bosses added after v1 — used by migrations to backfill existing saves. */
export function extraSeedBosses(): Boss[] {
  return EXTRA_BOSSES.map(buildBoss);
}

export const REWARDS_PERSONAL: RewardDef[] = [
  { id: 'p_snack', icon: '🍫', title: 'Godteri i butikken', desc: 'Velg én ting', cost: 10 },
  { id: 'p_dessert', icon: '🍨', title: 'Dessert etter middag', desc: 'Ditt valg fra fryseren', cost: 12 },
  { id: 'p_screen', icon: '📱', title: '30 min ekstra skjermtid', desc: 'Bruk når du vil denne uka', cost: 16 },
  { id: 'p_dish', icon: '🧽', title: 'Slippe oppvasken', desc: 'Én kveld uten oppvaskvakt', cost: 18 },
  { id: 'p_bed', icon: '🌙', title: 'Sen leggetid', desc: '30 min lenger oppe', cost: 22 },
];

export const REWARDS_GROUP: RewardDef[] = [
  { id: 'g_game', icon: '🎲', title: 'Spillkveld', desc: 'Brettspill og snacks for alle', cost: 50 },
  { id: 'g_movie', icon: '🎬', title: 'Familiens filmkveld', desc: 'Vi ser det dere velger', cost: 60 },
  { id: 'g_ice', icon: '🍦', title: 'Is-tur ut', desc: 'Hele familien på iskiosken', cost: 70 },
  { id: 'g_pizza', icon: '🍕', title: 'Pizzakveld', desc: 'Alle ønsker seg en topping', cost: 80 },
  { id: 'g_trip', icon: '🚗', title: 'Helgeutflukt', desc: 'Familien drar på tur', cost: 130 },
];
