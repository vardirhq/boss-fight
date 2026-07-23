import type { Lang } from './types';

export interface Strings {
  tagline: string; statBosses: string; statStreak: string; statPool: string; hpLeft: string;
  retreat: string; bossDefeated: string; victory: string; coinsLabel: string; mvp: string; fightAgainBtn: string;
  introAppears: string; tapStart: string; railTeam: string; tapPick: string; combo: string;
  turnPrefix: string; turnSuffix: string;
  level: string; statLine: string; dmgNow: string;
  tierLight: string; tierMed: string; tierCrit: string; badgeDone: string; badgeRepeat: string; badgeCrit: string;
  stAktiv: string; stBeseiret: string; stPlanlagt: string; stRare: string; stElite: string;
  eliteBonus: string; bossesSleeping: string; nextWakes: string; bossAwoke: string;
  mgrAsleep: string; mgrActive: string; mgrSleep: string; mgrWake: string; mgrUnlockAt: string;
  editChoresTitle: string; editChoresSub: string; chorePlaceholder: string; dmgWord: string;
  repMulti: string; repOnce: string; addChore: string; bossHpSum: string; hpWord: string;
  bossMgrTitle: string; bossMgrSub: string; bossNamePh: string; appearsWhen: string;
  schedAlways: string; schedDaily: string; schedWeekly: string; schedMonthly: string; dayOfMonth: string; notePh: string;
  editChoresBtn: string; addBoss: string;
  partyMgrTitle: string; partyMgrSub: string; namePh: string; colorWord: string; uploadPhoto: string; removeWord: string; addFighter: string;
  skip: string; getStarted: string; next: string;
  langStepTitle: string; langStepBody: string;
  ob1Title: string; ob1Body: string; ob2Title: string; ob2Body: string; ob3Title: string; ob3Body: string; ob4Title: string; ob4Body: string;
  obSetupTitle: string; obSetupBody: string;
  splashTagline: string; splashStart: string;
  navBosses: string; navTeam: string; navBattle: string; navTreasure: string; navBag: string;
  activeNow: string; scheduled: string; defeated: string;
  weekPlan: string; everyDay: string; noBoss: string;
  goFight: string; fightAgain: string; doEarly: string;
  team: string; teamSub: string; noFighters: string; noFightersSub: string; addFightersBtn: string;
  thisBattle: string; lastBattles: string; replayIntro: string;
  rewards: string; rewardsSub: string;
  inPool: string; wins: string; myCoins: string; coinsOf: string;
  myRewards: string; groupRewards: string; recentRedeemed: string;
  redeem: string; tooPricey: string;
  bag: string; bagSub: string; toUse: string;
  use: string; bagEmpty: string; bagEmptySub: string; goShop: string;
  chooseAttack: string; onTurn: string;
  settings: string; settingsSub: string; language: string;
  audioMotion: string; sound: string; soundSub: string;
  haptics: string; hapticsSub: string; reducedMotion: string;
  reducedMotionSub: string; data: string; resetProgress: string;
  resetSub: string; resetConfirmTitle: string;
  resetConfirmSub: string;
  cancel: string; resetYes: string; about: string; done: string;
}

export const STRINGS: Record<Lang, Strings> = {
  no: {
    tagline: 'Få husarbeidet til å miste HP.', statBosses: 'Bosser beseiret', statStreak: 'Dagsrekke', statPool: 'Fellespott', hpLeft: 'HP igjen',
    retreat: 'NULLSTILL', bossDefeated: 'BOSS BESEIRET', victory: 'SEIER!', coinsLabel: 'MYNTER', mvp: 'MVP', fightAgainBtn: 'SLÅSS IGJEN',
    introAppears: 'EN VILL BOSS DUKKER OPP', tapStart: 'trykk for å starte', railTeam: 'LAGET', tapPick: 'trykk for å velge hvem', combo: 'KOMBO',
    turnPrefix: '', turnSuffix: ' er på tur',
    level: 'NV', statLine: '{h} angrep nå · {x}', dmgNow: 'skade nå',
    tierLight: 'LETT', tierMed: 'MIDDELS', tierCrit: 'KRITISK', badgeDone: '✓ GJORT', badgeRepeat: '↻ GJENTAS', badgeCrit: 'KRIT',
    stAktiv: 'AKTIV', stBeseiret: 'BESEIRET', stPlanlagt: 'PLANLAGT', stRare: 'SJELDEN BOSS', stElite: 'RASENDE',
    eliteBonus: 'RASENDE BOSS · BONUSMYNTER!', bossesSleeping: '{n} BOSSER SOVER', nextWakes: 'Neste våkner ved {v} seire', bossAwoke: 'Ny boss vekket: {name}!',
    mgrAsleep: 'Sover', mgrActive: 'Aktiv', mgrSleep: 'La sove', mgrWake: 'Vekk nå', mgrUnlockAt: 'våkner ved {v} seire',
    editChoresTitle: 'REDIGER GJØREMÅL', editChoresSub: '{boss} · sett skade og hvor ofte', chorePlaceholder: 'Navn på gjøremål', dmgWord: 'Skade',
    repMulti: '↻ Gjentas flere ganger', repOnce: '✓ Kun én gang', addChore: '+ Legg til gjøremål', bossHpSum: 'Boss-HP = sum av all skade', hpWord: 'HP',
    bossMgrTitle: 'REDIGER BOSSER', bossMgrSub: 'Foreldremodus · navn, når de dukker opp og gjøremål', bossNamePh: 'Bossnavn', appearsWhen: 'DUKKER OPP',
    schedAlways: 'Alltid', schedDaily: 'Daglig', schedWeekly: 'Ukentlig', schedMonthly: 'Månedlig', dayOfMonth: 'Dag i måneden', notePh: 'Notat (f.eks. før leggetid)',
    editChoresBtn: 'Rediger gjøremål ({n}) ›', addBoss: '+ Legg til boss',
    partyMgrTitle: 'REDIGER KJEMPERE', partyMgrSub: 'Navn og farge · mynter og XP følger med', namePh: 'Navn', colorWord: 'FARGE', uploadPhoto: '📷 Last opp bilde', removeWord: 'Fjern', addFighter: '+ Legg til kjemper',
    skip: 'Hopp over', getStarted: 'KOM I GANG →', next: 'Neste →',
    langStepTitle: 'VELG SPRÅK', langStepBody: 'Hvilket språk vil dere spille på? Du kan endre det når som helst i innstillingene.',
    ob1Title: 'VELKOMMEN', ob1Body: 'Gjør husarbeidet til et arkadespill. Hvert gjøremål er et angrep — sammen feller familien bossene.',
    ob2Title: 'KJEMP SAMMEN', ob2Body: 'Velg hvem som er på tur, trykk på gjøremålene dere gjør, og se bossen miste HP. Klarer dere alt, faller den!',
    ob3Title: 'TJEN BELØNNINGER', ob3Body: 'Hver seier gir mynter og XP. Spar dine egne, eller bygg fellespotten til store familiepremier.',
    ob4Title: 'TILPASS ALT', ob4Body: 'Foreldre lager egne bosser, gjøremål og kjempere — med bilder og timeplaner. Klare for kamp?',
    obSetupTitle: 'SETT OPP LAGET', obSetupBody: 'Legg til alle i familien. Du kan endre alt senere.',
    splashTagline: 'Gjør husarbeid til episke kamper', splashStart: 'TRYKK FOR Å STARTE',
    navBosses: 'Bosser', navTeam: 'Lag', navBattle: 'Kamp', navTreasure: 'Skatt', navBag: 'Sekk',
    activeNow: 'AKTIVE NÅ', scheduled: 'PLANLAGT', defeated: 'BESEIRET',
    weekPlan: 'UKESPLAN', everyDay: 'Hver dag', noBoss: 'Fri',
    goFight: 'GÅ TIL KAMP ›', fightAgain: 'KJEMP IGJEN', doEarly: 'GJØR TIDLIG',
    team: 'LAGET', teamSub: '{n} kjempere', noFighters: 'Ingen kjempere ennå',
    noFightersSub: 'Legg til alle i familien for å<br>begynne å felle bosser sammen.', addFightersBtn: 'LEGG TIL KJEMPERE',
    thisBattle: 'DENNE KAMPEN · {boss}', lastBattles: 'SISTE KAMPER', replayIntro: 'Se introduksjonen på nytt',
    rewards: 'BELØNNINGER', rewardsSub: 'Tjen egne mynter · bidra til fellespotten for store premier',
    inPool: 'i fellespotten', wins: 'seiere', myCoins: 'MINE MYNTER', coinsOf: '{n} sine mynter',
    myRewards: 'MINE BELØNNINGER · dine mynter', groupRewards: 'FELLESBELØNNINGER · fellespott', recentRedeemed: 'NYLIG INNLØST',
    redeem: 'LØS INN', tooPricey: 'FOR DYRT',
    bag: 'SEKKEN', bagSub: 'Premier du har løst inn · bruk dem når du vil', toUse: 'Å BRUKE ({n})',
    use: 'BRUK', bagEmpty: 'Sekken er tom', bagEmptySub: 'Løs inn en premie i Skatt-butikken,<br>så havner den her til du vil bruke den.', goShop: 'GÅ TIL BUTIKKEN',
    chooseAttack: 'VELG ANGREP', onTurn: 'er på tur',
    settings: 'INNSTILLINGER', settingsSub: 'Språk, lyd og familiedata', language: 'SPRÅK',
    audioMotion: 'LYD OG BEVEGELSE', sound: 'Lyd', soundSub: 'Kampeffekter og seierslyd',
    haptics: 'Vibrasjon', hapticsSub: 'Haptisk respons ved angrep', reducedMotion: 'Redusert bevegelse',
    reducedMotionSub: 'Mindre risting og animasjon', data: 'DATA', resetProgress: 'Tilbakestill fremgang',
    resetSub: 'Sletter alle bosser, kjempere og mynter', resetConfirmTitle: 'Sikker?',
    resetConfirmSub: 'Alt av bosser, kjempere, mynter og fremgang slettes for godt. Dette kan ikke angres.',
    cancel: 'Avbryt', resetYes: 'Slett alt', about: 'Boss Kamp · v1.0', done: 'FERDIG',
  },
  en: {
    tagline: 'Make the chores lose HP.', statBosses: 'Bosses beaten', statStreak: 'Day streak', statPool: 'Shared pool', hpLeft: 'HP left',
    retreat: 'RESET', bossDefeated: 'BOSS DEFEATED', victory: 'VICTORY!', coinsLabel: 'COINS', mvp: 'MVP', fightAgainBtn: 'FIGHT AGAIN',
    introAppears: 'A WILD BOSS APPEARS', tapStart: 'tap to start', railTeam: 'TEAM', tapPick: 'tap to pick who', combo: 'COMBO',
    turnPrefix: '', turnSuffix: '’s turn',
    level: 'LV', statLine: '{h} attacks now · {x}', dmgNow: 'dmg now',
    tierLight: 'LIGHT', tierMed: 'MEDIUM', tierCrit: 'CRITICAL', badgeDone: '✓ DONE', badgeRepeat: '↻ REPEATS', badgeCrit: 'CRIT',
    stAktiv: 'ACTIVE', stBeseiret: 'DEFEATED', stPlanlagt: 'SCHEDULED', stRare: 'RARE BOSS', stElite: 'ENRAGED',
    eliteBonus: 'ENRAGED BOSS · BONUS COINS!', bossesSleeping: '{n} BOSSES ASLEEP', nextWakes: 'Next wakes at {v} wins', bossAwoke: 'New boss awakened: {name}!',
    mgrAsleep: 'Asleep', mgrActive: 'Active', mgrSleep: 'Put to sleep', mgrWake: 'Wake now', mgrUnlockAt: 'wakes at {v} wins',
    editChoresTitle: 'EDIT CHORES', editChoresSub: '{boss} · set damage and how often', chorePlaceholder: 'Chore name', dmgWord: 'Damage',
    repMulti: '↻ Repeats multiple times', repOnce: '✓ Once only', addChore: '+ Add chore', bossHpSum: 'Boss HP = sum of all damage', hpWord: 'HP',
    bossMgrTitle: 'EDIT BOSSES', bossMgrSub: 'Parent mode · name, when they appear and chores', bossNamePh: 'Boss name', appearsWhen: 'APPEARS',
    schedAlways: 'Always', schedDaily: 'Daily', schedWeekly: 'Weekly', schedMonthly: 'Monthly', dayOfMonth: 'Day of month', notePh: 'Note (e.g. before bedtime)',
    editChoresBtn: 'Edit chores ({n}) ›', addBoss: '+ Add boss',
    partyMgrTitle: 'EDIT FIGHTERS', partyMgrSub: 'Name and color · coins and XP carry over', namePh: 'Name', colorWord: 'COLOR', uploadPhoto: '📷 Upload photo', removeWord: 'Remove', addFighter: '+ Add fighter',
    skip: 'Skip', getStarted: 'GET STARTED →', next: 'Next →',
    langStepTitle: 'CHOOSE LANGUAGE', langStepBody: 'Which language do you want to play in? You can change it anytime in settings.',
    ob1Title: 'WELCOME', ob1Body: 'Turn chores into an arcade game. Every chore is an attack — together the family takes down the bosses.',
    ob2Title: 'FIGHT TOGETHER', ob2Body: "Pick who's up, tap the chores you do, and watch the boss lose HP. Clear them all and it falls!",
    ob3Title: 'EARN REWARDS', ob3Body: 'Every win gives coins and XP. Save your own, or build the shared pool for big family prizes.',
    ob4Title: 'CUSTOMIZE EVERYTHING', ob4Body: 'Parents create their own bosses, chores and fighters — with photos and schedules. Ready to fight?',
    obSetupTitle: 'SET UP THE TEAM', obSetupBody: 'Add everyone in the family. You can change it all later.',
    splashTagline: 'Turn chores into epic battles', splashStart: 'PRESS TO START',
    navBosses: 'Bosses', navTeam: 'Team', navBattle: 'Battle', navTreasure: 'Rewards', navBag: 'Bag',
    activeNow: 'ACTIVE NOW', scheduled: 'SCHEDULED', defeated: 'DEFEATED',
    weekPlan: 'WEEKLY PLAN', everyDay: 'Every day', noBoss: 'Off',
    goFight: 'GO TO BATTLE ›', fightAgain: 'FIGHT AGAIN', doEarly: 'DO EARLY',
    team: 'THE TEAM', teamSub: '{n} fighters', noFighters: 'No fighters yet',
    noFightersSub: 'Add everyone in the family to<br>start taking down bosses together.', addFightersBtn: 'ADD FIGHTERS',
    thisBattle: 'THIS BATTLE · {boss}', lastBattles: 'RECENT BATTLES', replayIntro: 'Watch the intro again',
    rewards: 'REWARDS', rewardsSub: 'Earn your own coins · chip into the shared pool for big prizes',
    inPool: 'in the shared pool', wins: 'wins', myCoins: 'MY COINS', coinsOf: "{n}'s coins",
    myRewards: 'MY REWARDS · your coins', groupRewards: 'SHARED REWARDS · shared pool', recentRedeemed: 'RECENTLY REDEEMED',
    redeem: 'REDEEM', tooPricey: 'TOO PRICEY',
    bag: 'THE BAG', bagSub: 'Rewards you’ve redeemed · use them whenever', toUse: 'TO USE ({n})',
    use: 'USE', bagEmpty: 'Your bag is empty', bagEmptySub: 'Redeem a reward in the shop,<br>and it’ll wait here until you use it.', goShop: 'GO TO SHOP',
    chooseAttack: 'CHOOSE ATTACK', onTurn: "'s turn",
    settings: 'SETTINGS', settingsSub: 'Language, sound and family data', language: 'LANGUAGE',
    audioMotion: 'SOUND & MOTION', sound: 'Sound', soundSub: 'Battle effects and victory sound',
    haptics: 'Vibration', hapticsSub: 'Haptic feedback on attacks', reducedMotion: 'Reduced motion',
    reducedMotionSub: 'Less shake and animation', data: 'DATA', resetProgress: 'Reset progress',
    resetSub: 'Deletes all bosses, fighters and coins', resetConfirmTitle: 'Are you sure?',
    resetConfirmSub: 'All bosses, fighters, coins and progress will be deleted for good. This cannot be undone.',
    cancel: 'Cancel', resetYes: 'Delete all', about: 'Boss Kamp · v1.0', done: 'DONE',
  },
};

export const DAY_LONG: Record<Lang, string[]> = {
  no: ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
export const DAY_SHORT: Record<Lang, string[]> = {
  no: ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
