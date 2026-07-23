# Adding bosses

A field guide for adding new bosses to Boss Kamp. Read this before creating one —
it captures the whole lifecycle (schedule, dormancy, milestone unlocks, elite
cycles, palette variants) and the two shipping paths.

## The mental model

A **boss** is just a *themed container* for a handful of **chores** plus a
**schedule** and a **lifecycle**. The chores are the real-world work (limited
supply — don't invent busywork). Everything else about a boss is free to vary to
keep the game fresh:

- **schedule** (`trigger`) — when it spawns
- **dormancy** (`dormant` + `unlockAt`) — whether it starts asleep and what wakes it
- **palette** (`hue`) — a permanent color shift so one sprite can back several distinct bosses
- **elite** — an automatic, per-cycle "enraged" variant (no per-boss config)

All boss definitions live in **`src/game/seed.ts`** as `SeedBoss` objects. You
almost never touch anything else to add a boss.

## The two shipping paths (pick one)

| Goal | Where to add it | Extra step |
| ---- | --------------- | ---------- |
| Ship to **fresh installs only** | `SEED_BOSSES` array | none |
| Ship to **existing players too** (backfilled onto their saves) | `EXTRA_BOSSES` array | **bump `SCHEMA_VERSION`** in `src/db/schema.ts` |

`ALL_SEED_BOSSES = [...SEED_BOSSES, ...EXTRA_BOSSES]` seeds fresh installs, so a
boss in either array appears on a new device. Only `EXTRA_BOSSES` is replayed by
the `runMigrations()` backfill for people who already have a save — and that only
happens when the stored `SCHEMA_VERSION` is behind, so **you must bump
`SCHEMA_VERSION`** (in `src/db/schema.ts`) whenever you add to `EXTRA_BOSSES`.
The backfill is non-destructive and keyed by boss `id`: existing ids are skipped,
so never recycle an id and never renumber existing ones.

> Rule of thumb: **new content for a live game → `EXTRA_BOSSES` + version bump.**
> Reserve `SEED_BOSSES` edits for the starter/front-line roster.

## The `SeedBoss` shape

```ts
{
  id: 'rust',                 // unique, stable, lowercase. NEVER reused or renamed.
  name: 'Rustkolossen',       // Norwegian display name (see i18n note below)
  sprite: SPRITE.trash,       // a key from the SPRITE map
  frames: 6,                  // OPTIONAL — >0 = animated sprite-sheet (only the Golden boss today)
  rare: true,                 // OPTIONAL — extra gold FX; excluded from elite rolls
  hue: 210,                   // OPTIONAL — permanent hue-rotate (deg) for a palette variant
  dormant: true,              // OPTIONAL — starts asleep, hidden from the roster
  unlockAt: 58,               // OPTIONAL — family victory count that auto-wakes it
  trigger: { type: 'månedlig', date: 8, note: 'Bod og garasje' },
  attacks: [                  // 4–6 reads best; each becomes a Chore
    { title: 'Rydd én hylle', damage: 14 },   // FIRST attack is auto-repeatable
    { title: 'Kast det ødelagte', damage: 24 },
    { title: 'Kjør til gjenbruk', damage: 34 },
  ],
}
```

`buildBoss()` derives the rest: chore ids (`'<bossId>-<i>'`), `hp = sum of
damage`, `clearedCycle`/`usedChores` empty, and copies `dormant`/`unlockAt`/`hue`.

### Attacks (chores)

- **The first attack is always repeatable** (`buildBoss` sets `repeatable: i === 0`);
  the rest are consumed once per cycle. Put the small, tap-many everyday action first.
- **Damage tiers** (from `game/logic.ts` / the battle UI): `>= 28` is a **crit**,
  `<= 14` is **light**, in between is medium. Aim for a mix, with 1–2 crits as the
  heavy finishers. Max HP is just the sum, so more/bigger attacks = a tankier boss.

### Trigger types

| `type` | Fields | Spawns when |
| ------ | ------ | ----------- |
| `alltid` | — | always active |
| `daglig` | — | every day |
| `ukentlig` | `day` (0=Sun … 6=Sat) | that weekday onward in the week |
| `månedlig` | `date` (1–28) | that day-of-month onward |
| `sjelden` | — | the legendary Golden boss; pseudo-random spawn |

`note` is a short free-text tag shown on the card (e.g. "Etter middag"). Keep the
trigger enum values as the Norwegian literals — they are domain values, not UI copy.

> Keep new dailies scarce. A big part of this feature is **fewer active bosses per
> day**. Prefer weekly/monthly schedules for new bosses so the home screen stays
> calm; the milestone-unlock drip does the "more content" job over time.

## Dormancy & milestone unlocks

`isAwake(boss, victories)` (in `game/logic.ts`) decides whether a boss appears at
all:

```
awake  ⇔  !dormant  ||  (unlockAt > 0 && victories >= unlockAt)
```

- **`dormant: false`** (default) → always awake; part of the roster immediately.
- **`dormant: true, unlockAt: N`** → hidden until the *family-wide* `victories`
  counter reaches `N`, then it awakens permanently and joins its schedule. This is
  the progression spine: it's a **shared** counter, so every fighter contributes
  and uneven per-fighter leveling never blocks or trivializes content.
- **`dormant: true, unlockAt: 0`** → asleep until a parent wakes it by hand
  (the sleep/wake toggle in the Boss Manager). Parents "putting a boss to sleep"
  sets this state.

When a win crosses a threshold, the store flashes `bossAwoke` ("Ny boss vekket:
…") naming the newcomer, and the Home screen shows a **"N BOSSER SOVER · Neste
våkner ved V seire"** teaser (count only — it doesn't spoil *which* bosses).

**Choosing `unlockAt`:** space thresholds out along the campaign. The current
staging runs ~2 → 58. Early everyday bosses unlock in the low single digits;
late palette-variant surprises sit at 34–58. Don't cluster many at the same number
unless you want a multi-boss reveal in one win.

## Elite (enraged) cycles — nothing to configure

`isElite(boss, now)` deterministically enrages ~22% of active-boss *cycles*
(`ELITE_CHANCE`). It's a pure hash of boss id + cycle window, so it's stable for a
cycle and re-rolls when the cycle rolls over. Effects:

- red aura + tinted sprite + a **RASENDE / ENRAGED** badge (Home + Battle)
- **coins ×`ELITE_COIN_MULT` (1.5)** on victory — career XP is *never* multiplied,
  because XP tracks real work and coins are the fun/variance lever
- **Rare bosses are excluded** (the Golden boss is already its own spectacle)

You get this for free on every non-rare boss. No fields to set.

### Bespoke enraged art (optional)

A boss can have a dedicated "enraged" sprite that replaces the base art (and the
red CSS tint) while it's elite. It's keyed by **base sprite**, not boss id, via the
`ELITE_SPRITE` map in `seed.ts`:

```ts
export const ELITE_SPRITE: Record<string, string> = {
  [SPRITE.laundry]: SPRITE.laundryElite,
};
```

To add one: drop a transparent WebP in `public/uploads/`, add it to the `SPRITE`
map, and add a `base → elite` entry to `ELITE_SPRITE`. That's it — no schema
change, no per-boss field. Any boss (seeded or parent-created) using that base
sprite automatically shows the art when it rolls elite; bosses without an entry
fall back to the generic red tint. Keep the elite sprite **out of `SPRITE_POOL`**
so parents don't pick it as a base. When bespoke art is present, the Battle screen
also drops the generic red aura (`hasEliteArt`) so the art's own effects read
cleanly. Rendering resolves the swap in `BossSprite` (via `eliteSpriteFor`) and in
the Home `BossCard`.

## Art: new sprite vs. palette variant

You have two ways to give a boss a look:

**A. New sprite art.** Ship boss art as **WebP with alpha**, not PNG — the roster
was converted for a ~6x size drop (a transparent boss PNG is ~1.5–2 MB; the WebP
is ~200–300 KB). Convert a source PNG with `sharp`:
`sharp(inPng).webp({ quality: 82, alphaQuality: 90, effort: 6 })` — use
`{ quality: 92 }` for animated sprite-sheets to keep frames crisp. Drop the `.webp`
in `public/uploads/` (or `public/sprites/`), then in `seed.ts`:
1. add a key to the `SPRITE` map, e.g. `broom: '/uploads/broom-wraith-transparent.webp'`
2. reference it as `sprite: SPRITE.broom`
3. add it to `SPRITE_POOL` so the Boss Manager's "cycle sprite" button can reach it
   (skip the pool for one-off rare/animated sprites like the Golden sheet).

Art lives outside the Workbox precache on purpose (runtime cache-first) — don't
move it into the precache glob in `vite.config.ts`. If you ever rename or
re-encode an existing sprite, remember its path may be persisted in players'
saves: `remapSprite()` (derived from `SPRITE`) rewrites old `/uploads/*.png` paths
to their current file on load, so keep that mechanism in mind.

**B. Reuse a sprite with a `hue` shift (no new art).** Set `hue` to a degree value
and the same silhouette reads as a distinct "frost / mold / shadow" creature. This
is how the current variant bosses work:

| Boss | Base sprite | `hue` |
| ---- | ----------- | ----- |
| Frostvaskedragen | `SPRITE.laundry` | 180 |
| Grønnmugghydraen | `SPRITE.dishes` | 110 |
| Skyggekraken | `SPRITE.paper` | 265 |
| Nattsvermen | `SPRITE.todo` | 305 |
| Rustkolossen | `SPRITE.trash` | 210 |

Pick base sprites with saturated art (laundry, dishes, trash, paper, todo shift
well; near-grayscale ones like mirror/backpack barely move). `bossFilter()` in
`game/logic.ts` composes the hue with the transient elite tint, and `BossSprite`
(plus the Home card/thumb and manager thumbnail) apply it everywhere.

## i18n note (important)

Boss **names** and **chore titles** are Norwegian string literals right in
`seed.ts` — they are *not* in the `game/i18n.ts` `Strings` tables and are **not
translated** to English. That's the established convention; follow it. Only add to
the `no`/`en` tables when you introduce new *UI chrome* (labels, badges, toasts) —
and then keep both tables in sync.

## Copy-paste checklist

1. Write the `SeedBoss` in **`SEED_BOSSES`** (fresh installs) or **`EXTRA_BOSSES`**
   (live update). Give it a brand-new `id`.
2. Art: reference an existing `SPRITE.*` (optionally with `hue`), or add new art →
   `SPRITE` map → `SPRITE_POOL`.
3. Decide the lifecycle: leave it awake, or `dormant: true` with an `unlockAt`
   spaced along the campaign.
4. 4–6 attacks, everyday tap-action first, a mix of light/medium/crit damage.
5. If you touched `EXTRA_BOSSES`, **bump `SCHEMA_VERSION`** in `src/db/schema.ts`.
6. `npm run build` (strict TS + `noUnused*` — must be clean).
7. Smoke-test with `npm run build && npm run preview`; on Home you should see the
   sleeping count update, and the boss appears at its unlock milestone / schedule.

## Where the pieces live

- `src/game/seed.ts` — boss definitions, `SPRITE` map, `SPRITE_POOL`, `buildBoss`
- `src/game/types.ts` — `Boss` / `Chore` / `Trigger` shapes
- `src/game/logic.ts` — `isAwake`, `isElite`, `bossFilter`, `slumberInfo`, schedule/HP math
- `src/db/schema.ts` — `SCHEMA_VERSION`, table DDL, added-column backfill
- `src/db/repository.ts` — row ↔ object mapping, `runMigrations()` backfill
- `src/store/GameContext.tsx` — victory rewards (elite mult + awaken toast), `toggleDormant`
- `src/screens/HomeScreen.tsx` / `BattleScreen.tsx` / `managers.tsx` — rendering
