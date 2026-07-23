# Boss Kamp

Turn household chores into epic co-op battles. **Boss Kamp** is an offline-first
PWA arcade-RPG for the whole family: every chore is an attack, every finished
step deals damage, and recurring life mess becomes a boss you fight together
instead of another beige checklist.

Built with **Vite + React + TypeScript**, persisted with **SQLite** running in
the browser (WebAssembly), and installable as a **Progressive Web App**.

## Features

- **Battle** any of 11 chore bosses (plus a rare "Golden Done" legendary boss),
  with an HP bar, combos, crits, damage numbers, victory confetti, and a small
  WebAudio SFX synth.
- **Bosses / Home** — weekly plan calendar, active/defeated boss cards, and a
  parent-mode boss manager (name, schedule, sprite, chores).
- **Team** — family fighters with colors, photo avatars, XP levels, and MVP
  tracking per battle.
- **Rewards** — earn coins from damage dealt; spend your own or pool them for
  big shared family prizes.
- **Bag** — redeemed reward vouchers, used whenever you like.
- **Norwegian + English**, sound / haptics / reduced-motion settings.
- **Offline-first**: installable, works with no network, and all progress is
  stored locally.

## Tech & architecture

| Concern        | Choice |
| -------------- | ------ |
| Build / dev    | Vite 5 |
| UI             | React 18 + TypeScript (strict) |
| Persistence    | `@sqlite.org/sqlite-wasm` — a real SQLite DB in the browser |
| PWA            | `vite-plugin-pwa` (Workbox) with a web manifest + service worker |

```
src/
  db/          SQLite: wasm init (OPFS with in-memory fallback), schema, repository
  game/        Pure domain: types, seed data, i18n strings, game logic
  store/       React context store, game actions, WebAudio engine
  screens/     Battle, Home, Party, Rewards, Bag, managers, overlays, nav
  ui/          Shared components (boss sprite, avatar, strings hook)
```

### SQLite in the browser

`src/db/sqlite.ts` boots the official SQLite WebAssembly build and prefers the
**OPFS SAHPool** VFS, which stores a genuine on-disk SQLite database in the
browser's Origin Private File System — persistent across reloads and needing no
special cross-origin-isolation headers. Where OPFS is unavailable it transparently
falls back to an in-memory database that is exported to `localStorage` on each
save, so the app stays fully functional and persistent everywhere. The schema
(`src/db/schema.ts`) is normalized into `bosses`, `chores`, `fighters`,
`redemptions`, and related tables; `src/db/repository.ts` maps between those rows
and the in-memory game state.

## Development

```bash
npm install
npm run dev       # start the dev server
npm run build     # type-check + production build
npm run preview   # preview the production build (service worker active)
```

The PWA service worker is only active in the production build (`build` +
`preview`), not in `dev`.
