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
  golden: '/uploads/the-golden-done-idle-sprite-sheet-transparent.png',
} as const;

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
}

const SEED_BOSSES: SeedBoss[] = [
  { id: 'laundry', name: 'Vaskedragen', sprite: SPRITE.laundry, trigger: { type: 'daglig', note: 'Vaskedag' },
    attacks: [
      { title: 'Start en vask', damage: 12 }, { title: 'Heng opp klær', damage: 18 }, { title: 'Brett bunken', damage: 28 },
      { title: 'Par sokkene', damage: 14 }, { title: 'Legg bort klær', damage: 32 }, { title: 'Fjern gulvsokker', damage: 16 },
    ] },
  { id: 'socks', name: 'Sokkesluket', sprite: SPRITE.socks, trigger: { type: 'ukentlig', day: 0, note: 'Sorter matchende sokker' },
    attacks: [
      { title: 'Finn løse sokker', damage: 14 }, { title: 'Par opp sokker', damage: 22 }, { title: 'Legg i skuffen', damage: 16 },
      { title: 'Kast hullete sokker', damage: 12 }, { title: 'Tøm skittentøyet', damage: 26 },
    ] },
  { id: 'dishes', name: 'Oppvaskhydraen', sprite: SPRITE.dishes, trigger: { type: 'daglig', note: 'Etter middag' },
    attacks: [
      { title: 'Skrap tallerkener', damage: 12 }, { title: 'Fyll oppvaskmaskinen', damage: 20 }, { title: 'Skrubb pannene', damage: 30 },
      { title: 'Tørk og stable', damage: 16 }, { title: 'Tørk benkene', damage: 14 }, { title: 'Tøm stativet', damage: 34 },
    ] },
  { id: 'fridge', name: 'Kjøleskapsråten', sprite: SPRITE.fridge, trigger: { type: 'ukentlig', day: 6, note: 'Storrengjøring' },
    attacks: [
      { title: 'Kast utgått mat', damage: 16 }, { title: 'Sjekk datoer', damage: 14 }, { title: 'Tørk hyllene', damage: 24 },
      { title: 'Vask grønnsaksskuffen', damage: 28 }, { title: 'Kast muggen rest', damage: 18 }, { title: 'Tørk søl', damage: 12 },
    ] },
  { id: 'crumb', name: 'Smulekolossen', sprite: SPRITE.crumb, trigger: { type: 'daglig', note: 'Etter måltid' },
    attacks: [
      { title: 'Kost opp smuler', damage: 16 }, { title: 'Tørk bordet', damage: 14 }, { title: 'Rist duken', damage: 12 },
      { title: 'Støvsug under bordet', damage: 26 }, { title: 'Tøm brødristeren', damage: 18 },
    ] },
  { id: 'toys', name: 'Lekekjempen', sprite: SPRITE.toys, trigger: { type: 'daglig', note: 'Før leggetid' },
    attacks: [
      { title: 'Kast i kassen', damage: 14 }, { title: 'Sorter klossene', damage: 18 }, { title: 'Redd bortkomne biter', damage: 16 },
      { title: 'Stable spillene', damage: 12 }, { title: 'Rydd gulvet', damage: 30 }, { title: 'Pakk gi-bort-ting', damage: 36 },
    ] },
  { id: 'paper', name: 'Papirkraken', sprite: SPRITE.paper, trigger: { type: 'månedlig', date: 1, note: 'Regningsdag' },
    attacks: [
      { title: 'Åpne posten', damage: 12 }, { title: 'Sorter regninger', damage: 18 }, { title: 'Arkiver kvitteringer', damage: 16 },
      { title: 'Makuler gammelt', damage: 20 }, { title: 'Betal regningene', damage: 34 }, { title: 'Tøm innboksen', damage: 38 },
    ] },
  { id: 'trash', name: 'Søppelbehemoten', sprite: SPRITE.trash, trigger: { type: 'ukentlig', day: 4, note: 'Søppeldag' },
    attacks: [
      { title: 'Knyt igjen posene', damage: 14 }, { title: 'Bær ut restavfall', damage: 20 }, { title: 'Sorter pant', damage: 16 },
      { title: 'Tøm papir og plast', damage: 22 }, { title: 'Skyll og kast glass', damage: 18 }, { title: 'Trill dunken til veien', damage: 30 },
    ] },
  { id: 'mirror', name: 'Speilspøkelset', sprite: SPRITE.mirror, trigger: { type: 'ukentlig', day: 3, note: 'Baderomsvask' },
    attacks: [
      { title: 'Puss speilet blankt', damage: 18 }, { title: 'Skrubb vasken', damage: 22 }, { title: 'Rens kranen', damage: 14 },
      { title: 'Tørk flisene', damage: 20 }, { title: 'Vask toalettet', damage: 28 }, { title: 'Bytt håndklær', damage: 16 },
    ] },
  { id: 'backpack', name: 'Sekkeskredet', sprite: SPRITE.backpack, trigger: { type: 'daglig', note: 'Etter skolen' },
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

export function sumDamage(chores: Chore[]): number {
  return chores.reduce((s, c) => s + (Number(c.damage) || 0), 0);
}

/** Build the initial boss list with derived HP and chore ids. */
export function seedBosses(): Boss[] {
  return SEED_BOSSES.map((b) => {
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
    };
  });
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
