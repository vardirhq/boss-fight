# Accounts, households & sync — schema

Design for turning Boss Kamp from a single-device offline PWA into a synced
household game, without losing the offline-first experience or the
kitchen-tablet way families actually play.

The account, household, fighter-claiming, pairing, authoritative configuration,
append-only activity, and wallet foundations described here are implemented.
The client keeps a local render cache and durable outbound queue, while the
server is authoritative after a household is connected. Remaining production
hardening work is tracked separately (notably versioned migrations, recovery
flows, and broader integration coverage).

---

## Principles

1. **A fighter is a game profile; a user is an authenticated person.** Every
   adult account gets one linked fighter automatically when they create or join
   a household. Manually created fighters are reserved for people who play
   through a parent or shared device, and may later be claimed by one user.
2. **Claimed ≠ locked.** Claiming a fighter lets that person play from their own
   device. It does *not* have to stop the family tablet from logging their
   chores. Those are two separate flags (see [Authority](#authority-rules)).
3. **Per-cycle boss state is derived, never stored.** HP, used chores, and
   "cleared" fall out of an append-only event log. This is what makes concurrent
   writes from two phones safe without conflict resolution.
4. **Mutable config gets versions and tombstones; events are immutable.** Two
   different sync strategies for two different kinds of table.
5. **Snapshots survive edits.** A completion records the chore's title and damage
   at the time; a voucher records the reward's price at the time. Editing a chore
   or reward must never rewrite history.
6. **One clock per household.** All cycle keys and deterministic rolls are
   computed in the household's timezone, never the device's.
7. **Children are not email accounts.** They get identities without contact data.

---

## Identity

Children get a `users` row like everyone else — but with **no email and no
password**. They authenticate by household pairing plus a PIN. This keeps
`fighters.user_id` uniform, keeps foreign keys simple, stores no children's
contact data, and gives a clean upgrade path: a child turning 13 sets an email on
the row they already have and keeps all their history.

`users.kind` governs *how you can authenticate*. `household_members.role`
governs *what you may do*. Keep them separate — families are not a hierarchy that
maps cleanly onto "adult".

```sql
create table users (
  id                uuid primary key,
  kind              text not null check (kind in ('adult','child')),
  email             text,
  password_hash     text,
  display_name      text not null,
  email_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  version           integer not null default 1,

  constraint users_adult_has_email
    check (kind <> 'adult' or email is not null),
  constraint users_child_has_no_contact_data
    check (kind <> 'child' or (email is null and password_hash is null))
);

create unique index users_email_key on users (lower(email))
  where email is not null and deleted_at is null;
```

```sql
create table households (
  id                   uuid primary key,
  name                 text not null,
  -- IANA zone. The ONLY clock used for cycle keys, elite rolls and rare spawns.
  timezone             text not null default 'Europe/Oslo',
  join_code_hash       text,
  join_code_expires_at timestamptz,
  -- victories accrued before the household went online (see migration)
  victories_baseline   integer not null default 0,
  created_by_user_id   uuid not null references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  version              integer not null default 1
);
```

```sql
create table household_members (
  id                 uuid primary key,
  household_id       uuid not null references households(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  role               text not null check (role in ('owner','parent','member','child')),
  status             text not null default 'active'
                       check (status in ('invited','active','suspended','left')),
  invited_by_user_id uuid references users(id),
  joined_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            integer not null default 1,
  unique (household_id, user_id)
);
```

A household must always retain at least one `active` owner — enforce in the
application layer, not with a constraint you'll fight forever.

### Devices

The kitchen tablet is a first-class principal, not a logged-in parent who forgot
to sign out. `kind = 'household'` devices may act as any unlocked fighter; that
is the shared-couch case, and it is the reason strict per-user ownership would
break the product.

```sql
create table devices (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid references users(id) on delete cascade,   -- null for shared devices
  kind         text not null check (kind in ('personal','household')),
  name         text not null default '',
  platform     text not null default '',
  token_hash   text,          -- long-lived device token (child & household devices)
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
```

```sql
create table sessions (
  id           uuid primary key,
  user_id      uuid not null references users(id) on delete cascade,
  device_id    uuid references devices(id) on delete set null,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
```

### Claiming a fighter

Two paths, deliberately. Adults get email invites; children get a code shown on
the parent's screen and typed (or scanned) on the child's device. Never store a
raw token — only a hash, exactly as with password resets.

```sql
create table household_invites (            -- adults only
  id                  uuid primary key,
  household_id        uuid not null references households(id) on delete cascade,
  invited_email       text not null,
  role                text not null check (role in ('parent','member')),
  fighter_id          uuid references fighters(id) on delete set null,
  token_hash          text not null,
  created_by_user_id  uuid not null references users(id),
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  accepted_by_user_id uuid references users(id),
  created_at          timestamptz not null default now()
);

create table device_pairings (              -- children & shared devices
  id                 uuid primary key,
  household_id       uuid not null references households(id) on delete cascade,
  fighter_id         uuid references fighters(id) on delete cascade,
  role               text not null check (role in ('household_device','fighter')),
  code_hash          text not null,
  created_by_user_id uuid not null references users(id),
  expires_at         timestamptz not null,
  claimed_at         timestamptz,
  claimed_device_id  uuid references devices(id),
  created_at         timestamptz not null default now()
);

create table fighter_credentials (
  fighter_id      uuid primary key references fighters(id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);
```

---

## Fighters

```sql
create table fighters (
  id                 uuid primary key,
  household_id       uuid not null references households(id) on delete cascade,
  user_id            uuid references users(id) on delete set null,
  name               text not null,
  color              text not null,
  avatar_hash        text,        -- content hash; bytes live in fighter_avatars
  -- when true, ONLY the linked user's device may act as this fighter
  require_own_device boolean not null default false,
  streak             integer not null default 0,
  coins_cached       integer not null default 0,
  career_xp_cached   integer not null default 0,
  sort               integer not null default 0,
  created_by_user_id uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  version            integer not null default 1,

  constraint fighters_lock_requires_claim
    check (require_own_device = false or user_id is not null)
);

create unique index fighters_one_per_user
  on fighters (household_id, user_id)
  where user_id is not null and deleted_at is null;

create index fighters_household on fighters (household_id) where deleted_at is null;
```

`coins_cached` and `career_xp_cached` are exactly that — caches. The ledger and
the completion log are the truth (see [Derived state](#derived-state)).

`streak` is carried forward as-is. Note that today nothing ever increments it
(`GameContext.tsx:464` sets it to 0 and no code path changes it); it is a
vestigial column and the Party screen's "day streak" stat is decorative. Either
implement it from `chore_completions` or drop it — but decide, don't inherit the
ambiguity into a synced schema.

Avatars live in their own table. They are ~5–15 KB base64 data-URLs today; inline
on the `fighters` row they'd re-sync on every name or colour tweak.

```sql
create table fighter_avatars (
  fighter_id uuid primary key references fighters(id) on delete cascade,
  mime       text not null,
  bytes      bytea not null,
  hash       text not null,
  updated_at timestamptz not null default now()
);
```

---

## World config

Note what is **absent** from `bosses`: no `hp`, no `cleared_cycle`, no
`used_chores`. That is the point — those are per-cycle state, and per-cycle state
is derived. Two phones both landing "Tøm oppvaskmaskin" under last-write-wins
leaves the boss at 40 or 60 HP depending on who writes last; derived-from-log
gives every device the same answer with no conflict resolution at all.

```sql
create table bosses (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  sprite       text not null,
  frames       integer not null default 0,
  rare         boolean not null default false,
  hue          integer,
  trigger_type text not null
                 check (trigger_type in ('alltid','daglig','ukentlig','månedlig','sjelden')),
  trigger_day  integer check (trigger_day between 0 and 6),
  trigger_date integer check (trigger_date between 1 and 28),
  trigger_note text,
  dormant      boolean not null default false,
  unlock_at    integer not null default 0,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      integer not null default 1
);

create index bosses_household on bosses (household_id) where deleted_at is null;
```

```sql
create table chores (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  boss_id      uuid not null references bosses(id) on delete restrict,
  title        text not null default '',
  damage       integer not null default 0,
  repeatable   boolean not null default false,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      integer not null default 1
);

create index chores_boss on chores (boss_id) where deleted_at is null;
```

`on delete restrict` plus soft deletes throughout: deleting a boss must never
cascade away a family's history of having beaten it.

Rewards are static constants today (`REWARDS_PERSONAL` / `REWARDS_GROUP` in
`seed.ts:244,252`). Promote them to per-household rows so parents can edit them —
seeded from those constants on migration.

```sql
create table rewards (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  scope        text not null check (scope in ('personal','group')),
  icon         text not null default '',
  title        text not null default '',
  descr        text not null default '',
  cost         integer not null check (cost >= 0),
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      integer not null default 1
);
```

---

## The event log

Three append-only tables. Everything about a battle in progress is reconstructed
from these.

```sql
create table chore_completions (
  id                     uuid primary key,
  household_id           uuid not null references households(id) on delete cascade,
  boss_id                uuid not null references bosses(id) on delete restrict,
  chore_id               uuid not null references chores(id) on delete restrict,
  fighter_id             uuid not null references fighters(id) on delete restrict,
  -- which recurrence window, and which run within it
  cycle_key              text not null,
  reset_seq              integer not null default 0,
  -- snapshots: history survives later edits to the chore
  chore_title            text not null,
  damage                 integer not null,
  -- audit: who physically did this, and was it on someone else's behalf
  performed_by_user_id   uuid references users(id),
  performed_by_device_id uuid references devices(id),
  acted_on_behalf        boolean not null default false,
  completed_at           timestamptz not null,
  -- corrections are voids, not deletes (monotonic ⇒ conflict-free)
  voided_at              timestamptz,
  voided_by_user_id      uuid references users(id),
  created_at             timestamptz not null default now(),
  server_seq             bigserial not null
);

create index cc_cycle on chore_completions (household_id, boss_id, cycle_key)
  where voided_at is null;
create index cc_sync  on chore_completions (household_id, server_seq);
create index cc_xp    on chore_completions (household_id, fighter_id)
  where voided_at is null;
```

"Fight again" and "chores edited" are not deletions — they are reset events that
start a new run within the same cycle.

```sql
create table boss_resets (
  id                 uuid primary key,
  household_id       uuid not null references households(id) on delete cascade,
  boss_id            uuid not null references bosses(id) on delete restrict,
  cycle_key          text not null,
  reset_seq          integer not null,     -- 0-based ordinal within (boss, cycle)
  reason             text not null check (reason in ('fight_again','chores_edited','manual')),
  created_by_user_id uuid references users(id),
  created_at         timestamptz not null default now(),
  server_seq         bigserial not null,
  unique (household_id, boss_id, cycle_key, reset_seq)
);
```

Victory is recorded, not inferred, because it has payouts attached. The unique
constraint is the whole trick: two devices that simultaneously deal the killing
blow both try to insert the same row, one wins, and coins are granted exactly
once. Keying on `reset_seq` preserves today's behaviour where beating a boss
again after "Slåss igjen" pays out again.

```sql
create table boss_victories (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  boss_id      uuid not null references bosses(id) on delete restrict,
  cycle_key    text not null,
  reset_seq    integer not null default 0,
  elite        boolean not null default false,
  rare         boolean not null default false,
  won_at       timestamptz not null,
  created_at   timestamptz not null default now(),
  server_seq   bigserial not null,
  unique (household_id, boss_id, cycle_key, reset_seq)
);
```

---

## Economy

`fighter_id IS NULL` means the **fellespott** (shared pool). That is the gap in
any ledger that makes `fighter_id` mandatory — `transfer()`
(`GameContext.tsx:628`) moves coins from a fighter to a household-level scalar
with no fighter attached. A transfer is two rows sharing a `transfer_group`,
summing to zero.

```sql
create table wallet_transactions (
  id                 uuid primary key,
  household_id       uuid not null references households(id) on delete cascade,
  fighter_id         uuid references fighters(id) on delete restrict,  -- NULL = fellespott
  amount             integer not null,                                 -- signed
  kind               text not null
                       check (kind in ('boss_reward','transfer','redemption','adjustment','refund')),
  transfer_group     uuid,          -- pairs the two legs of a transfer
  reference_type     text,          -- 'boss_victory' | 'reward_redemption' | …
  reference_id       uuid,
  note               text,
  created_by_user_id uuid references users(id),
  created_at         timestamptz not null default now(),
  server_seq         bigserial not null
);

-- one payout per (fighter, source event) — replayed sync can never double-credit
create unique index wt_idempotent on wallet_transactions (
  household_id,
  coalesce(fighter_id, '00000000-0000-0000-0000-000000000000'::uuid),
  reference_type,
  reference_id
) where reference_type is not null;

create index wt_balance on wallet_transactions (household_id, fighter_id);
```

```sql
create table reward_redemptions (
  id                   uuid primary key,
  household_id         uuid not null references households(id) on delete cascade,
  reward_id            uuid references rewards(id) on delete set null,
  scope                text not null check (scope in ('personal','group')),
  fighter_id           uuid references fighters(id) on delete restrict,
  -- voucher snapshot: unaffected if the reward is later edited or deleted
  icon                 text not null default '',
  title                text not null default '',
  cost                 integer not null,
  status               text not null default 'active'
                         check (status in ('pending','active','used','cancelled','rejected')),
  requested_by_user_id uuid references users(id),
  approved_by_user_id  uuid references users(id),
  used_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  version              integer not null default 1,
  server_seq           bigserial not null,

  check ((scope = 'personal') = (fighter_id is not null))
);
```

The snapshot columns are not redundancy for its own sake — today's `Redemption`
(`types.ts:67-75`) already denormalises icon/title/cost, and it's correct: a
voucher sitting in the Bag must not change price because a parent edited the
reward last week. `status = 'pending'` exists so parent approval can be switched
on later without a migration; ship with everything going straight to `'active'`.

---

## Derived state

Nothing below is stored as truth. All of it is recomputed on load and after every
sync pull.

Let `ck = cycleKey(boss, now_in_household_tz)` and
`rs = max(reset_seq) for (boss, ck)`, defaulting to 0.

```
live(boss)   = completions where boss_id = boss
                 and cycle_key = ck and reset_seq = rs
                 and voided_at is null

hp           = maxHpOf(chores) − Σ live(boss).damage        -- clamped at 0
usedChores   = distinct chore_id in live(boss)              -- non-repeatable only
cleared      = exists a boss_victories row for (boss, ck, rs)
battle log   = live(boss), newest first

coins(f)     = Σ wallet_transactions.amount where fighter_id = f
pool         = Σ wallet_transactions.amount where fighter_id is null
careerXp(f)  = career_xp_baseline(f) + Σ live-forever completions.damage for f
victories    = households.victories_baseline + count(boss_victories)
goldenRevealed = victories_baseline_golden or exists boss_victories where rare
```

Note `careerXp` counts *all* non-voided completions ever, not just the current
cycle — which is why cycle rollover must stop deleting log rows.
`rolloverCycles()` currently drops them (`GameContext.tsx:690`), and
`finishEditChores()` drops them too (`GameContext.tsx:586`). Both become no-ops
on history: rollover is just a change in `ck`, and a chore edit writes a
`boss_resets` row.

### One clock, three consumers

`cycleKey()` uses `now.toDateString()` and local `getDay()`/`getMonth()`
(`logic.ts:16-22`). `isElite()` and the `sjelden` spawn roll are deterministic
hashes over the local date (`logic.ts:58-95`) — they agree across devices *only
if the devices agree on what day it is*. A phone on holiday, or one with a wrong
timezone, and the Golden boss exists on one device and not the other.

All three must take the household timezone. This is one column and one plumbing
change that fixes cycle rollover, elite rolls, and rare spawns together.

---

## Authority rules

The database stores relationships; the server enforces the rules. Endpoints must
never trust a submitted `fighterId` — derive the actor from the session, and
require an explicit act-on-behalf endpoint for the parent case.

| Fighter state | Who may act as it |
| --- | --- |
| `user_id IS NULL` (unclaimed) | any parent/owner, and household devices |
| claimed, `require_own_device = false` | the linked user, any parent/owner, and household devices — all audited |
| claimed, `require_own_device = true` | **only** the linked user's session |

Parents always manage the world regardless of claims: create and edit bosses,
chores and rewards, configure the household, unlink or suspend an account, and
see all activity. What they cannot do is silently *be* someone else — every
act-on-behalf write carries `performed_by_user_id`, `performed_by_device_id`, and
`acted_on_behalf = true`, and the fighter's own history shows it.

That middle row is the departure from strict ownership, and it is deliberate.
The party rail (`BattleScreen.tsx:141-144`) lets anyone tap any fighter to switch
who is attacking, and `activeFighterId` is household state persisted to `meta`
(`repository.ts:201`) — one tablet on the kitchen counter with kids taking turns
*is* the product. Strict ownership would mean connecting a child's account
removes them from the family tablet, which for a child with no phone deletes them
from the game. Ownership should govern authority, not physical presence; the
audit trail is what deters a parent claiming a child's coins, and it does so
without breaking the legitimate case.

`require_own_device` is there for the teenager who wants the strict rule. Default
it off.

---

## Row-level security

Every syncable table carries `household_id`. Enable RLS on all of them with a
single policy shape, so a bug in one endpoint can't leak across households:

```sql
alter table bosses enable row level security;
create policy bosses_household on bosses
  using (household_id = current_setting('app.household_id')::uuid);
```

---

## Local SQLite changes

The local database holds **exactly one household**, so no `household_id` column
is needed locally. Tables mirror the server minus that column, plus two sync
columns on every syncable table:

```sql
server_seq INTEGER NOT NULL DEFAULT 0,   -- 0 = never acked by the server
dirty      INTEGER NOT NULL DEFAULT 0    -- 1 = local change awaiting push
```

Three structural changes beyond mirroring:

**1. Split device-local state out of `meta`.** Today `lang`, `sound`, `haptics`,
`reducedMotion`, `activeFighterId` and `currentBossId` are persisted as household
state (`repository.ts:196-207`). They are device preferences and device
navigation. Syncing them means one child switching to English flips a parent's
phone, and tapping a boss on the tablet yanks another device's screen mid-battle.

```sql
CREATE TABLE IF NOT EXISTS device_prefs (key TEXT PRIMARY KEY, value TEXT);
```

`meta` keeps only `schema_version`, the sync cursor, and the household/session
identity. **This split is worth doing now, before any server exists** — it is
cheap today and painful later.

**2. `bosses.hp` and `bosses.cleared_cycle` become caches.** Leave the columns
for fast offline boot, but recompute them from the event log at load and stop
treating them as truth.

**3. `saveState` has to go.** It is DELETE-everything-then-reinsert
(`repository.ts:145-194`), which structurally cannot distinguish "deleted" from
"not yet synced" — which is exactly why tombstones exist. Sync requires
per-row writes with `dirty` flags. This contradicts the current guidance in
`CLAUDE.md` ("Don't add incremental/dirty-tracking writes"); accounts overturn
that rule, and it is the single largest architectural cost of this whole feature.

```sql
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
-- 'cursor', 'last_pull_at', 'household_id', 'fighter_id', 'user_id'
```

Sync protocol, minimally: pull everything with `server_seq > cursor`; push all
rows where `dirty = 1`. Event tables never conflict (append-only, and voids are
monotonic). Config tables use `version` — a mismatch returns conflict and the
server's row wins for world config, since parents own the world.

---

## Migration path

### v4 — offline prep (ship before any backend exists)

Everything here runs on a single device with no network, and makes the eventual
upload trivial.

1. Create the new local tables (`chore_completions`, `boss_resets`,
   `boss_victories`, `wallet_transactions`, `rewards`, `reward_redemptions`,
   `device_prefs`, `sync_state`).
2. **Remap all ids to UUIDs.** Bosses, chores and fighters currently use
   `'b' + Date.now()` (`GameContext.tsx:459,532`) and seed slugs like
   `'laundry'`. Two devices creating a boss in the same millisecond collide.
   Switch new ids to `crypto.randomUUID()` and rewrite existing rows in one
   transaction — trivial now while there is exactly one copy of the data,
   an id-remap migration later. (UUID primary keys plus a `household_id` scoping
   column is simpler than composite `(household_id, id)` keys; it also removes
   the seed-slug collision problem entirely.)
3. Migrate `battle_log` → `chore_completions`, computing `cycle_key` for the
   current cycle and using `now` for `completed_at` (the old rows have no
   timestamp — `schema.ts:56-62`). Snapshot `chore_title`/`damage` from the
   chores they reference.
4. Seed `rewards` from `REWARDS_PERSONAL` / `REWARDS_GROUP`.
5. Migrate `redemptions` → `reward_redemptions`, mapping `who` (a display
   *name*, with the literal `'Felles'` for group redemptions —
   `GameContext.tsx:608,622`) to `fighter_id` by name match, falling back to
   `scope = 'group'` / NULL when no fighter matches.
6. **Seed the ledger so balances don't reset**: one `adjustment` row per fighter
   for their current `coins`, and one with `fighter_id IS NULL` for the current
   `pool`. Without this, deriving balances from an empty ledger zeroes everyone.
7. Store `career_xp` as `career_xp_baseline` and `victories` /
   `goldenRevealed` as household baselines — there is no event history behind
   them, and dormant-boss unlock progress (`isAwake`, `logic.ts:36`) must be
   preserved.
8. Move device preferences from `meta` into `device_prefs`.
9. Add `households.timezone` (locally: a `meta` key) and route `cycleKey`,
   `isElite` and `isDue` through it.

### v5 — go online

Parent registers from Settings → server creates `households` + `household_members`
(role `owner`) → client uploads its local rows verbatim (ids are already UUIDs)
→ server stamps `server_seq` → client stores `household_id` and session in
`sync_state`. The local database stays fully functional offline throughout; the
server is a peer, not a prerequisite.

Connecting a fighter: parent opens the fighter → "Koble til konto" → adults get a
`household_invites` email, children get a `device_pairings` code and set a PIN.
On acceptance the server creates the `users` row (child: no email), sets
`fighters.user_id`, inserts `household_members`, and marks the invite accepted.

The fighter card must then say what changed, in words. A disabled button with no
explanation is worse than the restriction it enforces.

---

## Behaviour changes this introduces

- **Cycle rollover no longer destroys history.** Today the battle log is deleted
  at rollover and on chore edits; it becomes a filtered view over a permanent
  log. Career XP becomes reconstructible rather than a running total.
- **Victory payouts become idempotent.** Two devices landing the killing blow
  simultaneously currently double-pay; the `boss_victories` unique constraint
  makes it exactly once. Replaying after "Slåss igjen" still pays, as today.
- **Mistaps become undoable** via void, instead of requiring a full boss reset.
- **Rewards become editable** per household rather than a fixed catalogue.

---

## Deliberately deferred

Not in the first online version, and none of it needs a schema change to add
later:

- Parent **approval workflow** — the `pending` status and `approved_by_user_id`
  columns exist; the flow does not.
- **Notifications**, activity feeds, and a separate audit-event table (the event
  tables already carry the audit trail).
- **OAuth / passkeys** — `users` can grow an `identities` table beside it.
- **Multiple households per user** — already expressible; just don't build the
  switcher yet.
- **Elaborate conflict resolution.** Derived state plus append-only events means
  the only real conflicts are simultaneous edits to the same boss or chore, which
  server-wins handles adequately.

---

## Smallest credible first version

If the goal is mainly *multi-device household* and *backup* rather than
per-child identity, the whole of §Identity can wait. A household with a join
code, one shared record, and every paired device treated as the household gets
most of the value for a fraction of the work — and every table above is
unchanged when per-fighter identity arrives later.

If building the full model, the v1 slice is:

```
users · households · household_members · devices · sessions
fighters · bosses · chores
chore_completions · boss_resets · boss_victories
wallet_transactions
```

Deferring `rewards`, `reward_redemptions`, `household_invites`,
`device_pairings` and `fighter_credentials` until the sync loop is proven.

---

## One thing to decide before building

Children's identities carry legal weight. Even without email, a child's name,
avatar and activity log on a server is personal data. Norway's age of digital
consent under GDPR art. 8 is 13; below it you need verifiable parental consent,
plus a privacy policy, a data processor agreement with your host, and deletion on
request. The no-email design above minimises this considerably — no contact data,
no password resets, nothing to breach beyond a first name and a chore history —
but it does not eliminate it. Worth settling before the first row is written.
