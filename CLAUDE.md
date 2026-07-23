# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Boss Kamp** — an offline-first PWA arcade-RPG that turns household chores into
co-op boss battles for a family. Every chore is an "attack"; finishing chores
deals damage; recurring life mess is modelled as bosses on schedules. Bilingual
(Norwegian default, English), installable, and fully functional offline with all
state stored locally in a real SQLite database running in the browser via
WebAssembly.

The package/app name is `boss-kamp`; the git repo is `boss-fight`. The primary
UI language and much of the domain vocabulary is Norwegian (see the glossary
below).

## Tech stack

- **Vite 5** — build & dev server
- **React 18 + TypeScript** (strict mode, `noUnusedLocals`/`noUnusedParameters`)
- **`@sqlite.org/sqlite-wasm`** — genuine SQLite in the browser (OPFS, in-memory fallback)
- **`vite-plugin-pwa`** (Workbox) — web manifest + service worker
- No CSS framework, no component library, no state library, no test framework.
  UI is plain React with **inline styles**; global keyframes live in `src/styles.css`.

## Commands

```bash
npm install
npm run dev       # Vite dev server (service worker DISABLED in dev)
npm run build     # tsc -b (type-check via project refs) + vite build
npm run preview   # serve the production build — the only way to exercise the PWA/SW
npm run lint      # tsc --noEmit (type-check only — there is no ESLint/Prettier config)
```

There is **no test suite and no linter binary**. "Lint" is a TypeScript
type-check. Before committing, run `npm run build` (or at minimum `npm run lint`)
to confirm the strict compiler is happy — unused locals/params are hard errors.

The PWA service worker only registers in the production build. Behaviour that
depends on caching or install must be verified with `build` + `preview`, not
`dev`.

## Architecture

```
src/
  main.tsx            Boot: opens the DB, loads state, mounts <GameProvider><App/>
  App.tsx             Tab router + overlay mounting (all screens live here)
  styles.css          CSS reset + ALL @keyframes (animations are referenced by name from inline styles)
  db/
    sqlite.ts         Db class: sqlite-wasm wrapper, OPFS-or-localStorage persistence
    schema.ts         DDL, table list, SCHEMA_VERSION, version read/write
    repository.ts     load/save/reset GameState <-> SQL rows, plus migrations
  game/               Pure, framework-free domain layer (no React imports)
    types.ts          All domain types + GameState shape
    seed.ts           Boss/chore/reward seed data, sprite paths, color palette
    logic.ts          Pure helpers: HP, cycle keys, schedule/spawn logic, level curve
    i18n.ts           STRINGS[lang] tables + day-name arrays
  store/
    GameContext.tsx   The store: React context, all actions/reducers, animation FX, persistence effect
    audio.ts          WebAudio SFX synth + haptics (buzz)
  screens/            One file per tab + managers/overlays/nav
    BattleScreen.tsx  The battle stage (HP bar, sprite, attacks, party rail, victory)
    HomeScreen.tsx    Bosses/home: weekly plan, active/defeated/scheduled boss cards
    PartyScreen.tsx   Family fighters, XP levels, MVP
    RewardsScreen.tsx Coin economy: personal + shared-pool rewards
    BagScreen.tsx     Redeemed reward vouchers
    managers.tsx      BossManager, ChoreEditor, PartyManager (parent-mode editors)
    overlays.tsx      Splash, Onboarding, SettingsPanel, Toast
    BottomNav.tsx     Tab bar
  ui/
    common.tsx        useT() strings hook, BossSprite, Avatar, shared color constants
public/
  sprites/, uploads/  Boss art (png/webp); runtime-cached, kept out of the precache
  icons/              PWA icons
```

### Data flow (one direction)

`Db` (SQLite) → `loadState()` builds a `GameState` → held in `GameProvider`'s
React state as `AppState = { game, ui }` → components read via `useGame()` and
mutate only through `actions` → an effect debounces (250 ms) and calls
`saveState()` back to SQLite.

- **`game`** is the *durable* slice (persisted). **`ui`** is *ephemeral*
  (never persisted): current tab, animation flags, combo counter, open editors,
  onboarding step, transient damage numbers/toasts.
- Components never call SQLite directly. They call `actions.*` on the context.
- Persistence is a **full rewrite** of every table inside one transaction
  (`saveState`) — the dataset is tiny, so this is intentional and simple. Don't
  add incremental/dirty-tracking writes.

### The store (`store/GameContext.tsx`)

The single source of truth. `actions` is a `useMemo`'d object of reducer-like
functions. Two internal helpers, `patchGame` and `patchUi`, do immutable
`setState` updates. Timers/animation callbacks read the latest state through
`stateRef` (a ref mirroring state) to avoid stale closures. DOM animation FX
(hit shake, boss death, flash, confetti) are imperative via the Web Animations
API on refs registered by the battle screen (`setStageRef`/`setSpriteRef`/
`setFlashRef`). Confetti pieces are stored in a ref, not state, and only exposed
through the context value when `ui.won` is true.

When adding a feature, prefer: add the state to `GameState` (durable) or
`UiState` (ephemeral) → add an action in `GameContext.tsx` → consume via
`useGame()` in a screen. Keep pure, testable logic in `game/logic.ts`.

### Persistence layer (`db/`)

`Db.open()` tries the **OPFS SAHPool VFS** first (a real on-disk SQLite DB in the
browser's Origin Private File System — persistent, no COOP/COEP headers needed,
synchronous so `flush()` is a no-op). If OPFS is unavailable it falls back to an
**in-memory** DB serialized to `localStorage` (base64) on every `flush()`. Both
paths keep the app persistent and offline. All `localStorage` access is wrapped
in try/catch (private-mode safe).

`repository.ts` owns the row↔object mapping. On first boot it seeds and stamps
`SCHEMA_VERSION`. On later boots, if the stored version is behind, it runs
`runMigrations()` then re-reads.

### Schema & migrations

- Bump `SCHEMA_VERSION` in `db/schema.ts` when you need a data migration.
- DDL is idempotent (`CREATE TABLE IF NOT EXISTS`) and applied on every boot via
  `ensureSchema`.
- Migrations live in `runMigrations()` in `repository.ts` and must be
  **version-gated and non-destructive** to existing player progress. The v2
  migration backfills newly-added bosses (the `EXTRA_BOSSES` set in `seed.ts`)
  onto existing saves without touching a player's edits.
- To ship a **new default boss to existing users**: add it to `EXTRA_BOSSES` in
  `seed.ts` and bump `SCHEMA_VERSION` so the backfill migration picks it up.
  Bosses in `SEED_BOSSES` only appear on fresh installs.
- **Adding bosses** (schedules, dormancy/milestone unlocks, elite cycles, palette
  variants): see the full field guide in `docs/adding-bosses.md`.

## Domain model (`game/types.ts`)

- **Boss** — has a `trigger` (schedule), a list of **Chore**s, current `hp`,
  a `clearedCycle` key, and `usedChores`. Max HP is the sum of its chores' damage
  (`maxHpOf`). `frames > 0` marks an animated sprite-sheet (the rare "Golden"
  boss); `rare` bosses get extra visual FX.
- **Chore** = an attack. `repeatable` chores can be tapped repeatedly per cycle;
  non-repeatable ones are consumed (tracked in `usedChores`). `damage >= 28` is a
  crit; `<= 14` is "light".
- **Trigger** types: `alltid` (always), `daglig` (daily), `ukentlig` (weekly,
  uses `day` 0=Sun), `månedlig` (monthly, uses `date` 1–28), `sjelden` (rare —
  the legendary Golden boss, pseudo-random spawn).
- **Cycles**: `cycleKey(boss)` produces a stable key for the boss's current
  recurrence window. `rolloverCycles()` (run on mount and after closing the boss
  manager) resets any boss whose cleared cycle has elapsed. `isDue` decides
  whether a boss is currently spawned; `statusOf` → `aktiv`/`beseiret`/`planlagt`.
- **Fighter** — family member; `careerXp` (= lifetime damage) drives the level
  curve (`levelInfo`), `coins` are personal currency, avatars are data-URLs.
- **Economy**: winning a battle grants each fighter coins = their damage / 4 and
  adds damage to `careerXp`. Coins are spent on personal `RewardDef`s or
  transferred into a shared `pool` for group rewards; redeeming creates a
  `Redemption` voucher (held in the Bag until "used").

## Conventions

- **Styling is inline** on elements as `style={{...}}` objects; there are no CSS
  classes beyond the `.scr` scrollbar helper. Reusable style objects are declared
  as module-level `const x: React.CSSProperties = {...}` at the bottom of a file.
  Animations are CSS `@keyframes` in `styles.css`, referenced by name from inline
  `animation:` strings. Add new keyframes there.
- **Colors**: a small fixed palette recurs — gold `#F4B942` (`GOLD`), dim
  `#6C7486` (`DIM`), cream text `#F6EBDD`, danger `#E0564A`, success `#67D391`.
  `ui/common.tsx` exports `GOLD`/`DIM`. The `'Press Start 2P'` pixel font (aliased
  `PS` locally in screens) is used for arcade headings; `Space Grotesk` is body.
- **i18n**: never hardcode user-facing text. Add a key to the `Strings` interface
  and both `no`/`en` tables in `game/i18n.ts`, then read it via `const t = useT()`.
  Some strings contain `{placeholder}` tokens or `<br>` and are interpolated at
  the call site. Domain enum values (trigger types) are Norwegian string
  literals — keep them as-is.
- **State immutability**: always produce new objects/arrays in actions; never
  mutate `game`/`ui` in place. Follow the existing `patchGame`/`patchUi` +
  spread pattern.
- **Pure vs. effectful**: keep schedule/HP/level math in `game/logic.ts` (no
  React, no DB). Keep DB access in `db/`. Keep React/animation/audio in `store/`
  and `screens/`.
- **`Date.now()` ids**: new bosses/fighters/chores/vouchers use timestamp-based
  string ids (`'b'+Date.now()`, etc.).
- TypeScript is strict and `noUnused*` is on — remove dead locals/params or the
  build fails. `any` is used only in the sqlite-wasm wrapper, each with an
  eslint-disable comment (there's no ESLint, but the comments document intent).

## Norwegian glossary (domain terms in code)

| Code term      | Meaning                                    |
| -------------- | ------------------------------------------ |
| `boss` / bosser | a chore-boss / bosses                     |
| kjemper(e)     | fighter(s) — a family member               |
| gjøremål       | chore / attack                             |
| skade          | damage                                     |
| `alltid`       | always (trigger)                           |
| `daglig`       | daily                                      |
| `ukentlig`     | weekly                                     |
| `månedlig`     | monthly                                    |
| `sjelden`      | rare (the legendary Golden boss)           |
| `aktiv` / `beseiret` / `planlagt` | active / defeated / scheduled |
| mynter         | coins                                      |
| fellespott     | shared pool                                |
| belønning      | reward                                     |

## Gotchas

- **`dev` has no service worker.** PWA/offline/caching only work in `build`+`preview`.
- **`node_modules` is not checked in** and a fresh clone needs `npm install`
  before any command works.
- Boss art in `public/uploads` and `public/sprites` is deliberately **excluded
  from the Workbox precache** (`vite.config.ts` glob) and runtime-cached
  cache-first instead — don't move it into the precache; it would bloat the
  install.
- `@sqlite.org/sqlite-wasm` is in Vite's `optimizeDeps.exclude` because it ships
  its own worker/wasm — leave it excluded.
- Saving is **debounced 250 ms**; a change and an immediate reload in a test can
  race the write. The fallback path also base64-serializes the whole DB on each
  flush.

## Working here

- Develop on the branch you were assigned; commit with clear messages; run
  `npm run build` before pushing.
- Do not add dependencies, a CSS framework, or a state library without a strong
  reason — the project intentionally stays dependency-light and vanilla-React.
- Keep the two-language (`no`/`en`) tables in sync whenever you touch UI copy.
</content>
</invoke>
