# Boss Kamp Independent Follow-up Audit

| Field | Value |
| --- | --- |
| Audit date | 2026-08-06 |
| Repository | `vardirhq/boss-fight` |
| Audited branch | `main` |
| Audited commit | `b0a5623` |
| Application version | `1.0.1` |
| Audit type | Independent source, sync, security, privacy, and operations review |
| Relationship to prior work | Independent second opinion; also re-verifies the tracker in [`2026-08-04-full-product-security-audit.md`](./2026-08-04-full-product-security-audit.md) |
| Report status | Final |

## 1. Executive summary

The remediation programme that followed the 2026-08-04 audit has held up well. Every
`BF-` finding marked `Remediated` was re-checked against the code and the claimed
control is genuinely present: server-authoritative redemption state, configuration
revisions with stale-snapshot rejection, per-mutation transactions with quarantine,
role hierarchy with last-owner protection, cursor-based bounded pulls, explicit
response projections, Keystore-backed native credentials, numbered migrations, and
non-root immutable images. The server is now a small composition root over focused
modules, and 53 server plus 38 client tests pass.

The problems that remain are of a different character than the original audit's.
They are not missing controls — they are **correctness and durability defects inside
the synchronization layer that the new test suites do not cover**:

1. Lifetime career XP is destroyed the moment a household goes online and anyone
   completes a chore. Verified empirically: 5 000 XP becomes 12.
2. The client's durable event cache grows without bound in `localStorage`, is
   re-serialized every 30 seconds, and silently stops persisting when the quota is
   reached — reintroducing the BF-009 "re-download everything forever" behaviour
   with no visible symptom.
3. Marking a freshly redeemed voucher as used is permanently rejected by the server
   and silently reverts on the next pull.
4. Adult login and registration have no route-specific rate limit, while every other
   credential route does.
5. Google Fonts are fetched from the network by an app that advertises full offline
   operation and by a children's product whose privacy notice discloses no third
   parties.

Two prior findings remain legitimately open (BF-005, BF-006); their engineering work
is done and the residue is organizational or CI-observational. One prior finding
(BF-022) carries a status note that is now factually stale — fixes exist upstream.

## 2. Scope and method

Full source read of `server/src` (all 30 modules), `src/online`, `src/store`,
`src/db`, `src/App.tsx`, `server/schema.sql`, all six migrations, and all six GitHub
Actions workflows. Data-flow tracing from user action → optimistic local state →
mutation queue → server transaction → event stream → pull → state replacement.
Route-by-route authorization review. Dependency audit of both trees. Build and both
test suites executed locally. One behavioural hypothesis (BK-001) was confirmed by
executing the real `serverSyncToGameState` against a synthetic sync payload.

No production system was contacted. No database was provisioned, so the PostgreSQL
integration suite (`erasure.integration.test.ts`) was skipped locally, and the
Android emulator journey was not executed.

### 2.1 Validation results

| Check | Result |
| --- | --- |
| Root TypeScript check + production build | Passed |
| Client test suite (`npm test`) | 38 passed, 0 failed |
| Server test suite (`server && npm test`) | 52 passed, 0 failed, 1 skipped (needs `TEST_DATABASE_URL`) |
| Root dependency audit | 3 high, 0 critical — all in the build toolchain |
| Server dependency audit | 0 findings |

## 3. Severity model

Unchanged from the 2026-08-04 audit: Critical / High / Medium / Low. No Critical
issue was found. Two High issues cause silent, user-visible data loss or unbounded
degradation in the normal happy path and should be fixed before the synchronized
product is promoted further.

## 4. Status of the prior audit's findings

### 4.1 Confirmed remediated

BF-001, BF-002, BF-003, BF-004, BF-007, BF-008, BF-009, BF-010, BF-011, BF-012,
BF-013, BF-014, BF-015, BF-016, BF-017, BF-018, BF-019, BF-020 and BF-021 were each
re-checked against current code and are present as described. Spot evidence:

- BF-001 — `server/src/syncPushRoutes.ts:87-94` locks the household row and rejects a
  mismatched `expectedRevision`; `syncPushRoutes.ts:281-286` refuses to implicitly
  soft-delete claimed fighters.
- BF-002 — each mutation runs in its own `sql.begin` with a per-item `catch`
  (`syncPushRoutes.ts:78`, `670-672`); `src/online/syncQueue.ts:19-25` quarantines
  rather than retrying.
- BF-003 — `server/src/redemption.ts` owns status, cost, and approver; the client's
  `status` is only ever `used`/`cancelled` against an `active` row.
- BF-004 — `server/src/governance.ts:196-211` enforces the hierarchy and last-owner
  rule; revocation is scoped by an `exists (… devices d … household_id = …)` clause.
- BF-011 — `server/src/syncProjection.ts` allowlists, and `syncPullRoutes.ts` selects
  explicit columns.
- BF-012 — `server/src/childAuth.ts` commits the failed attempt before returning 401.

### 4.2 Still open, carried forward

**BF-005 — Child-data lifecycle and privacy controls (was High; engineering complete,
residual is organizational).**

Implemented and verified: bilingual notice at `public/privacy.html`, versioned child
authorization (`child_authorizations`, `server/src/privacy.ts`), household export,
transactional child/household/adult erasure, a retention policy with a scheduled job,
and backup expiry. Outstanding, per `docs/privacy-and-retention.md:59-64` and
unchanged since the last audit:

- qualified counsel review of lawful basis and notice language;
- documented processor agreements, hosting/storage locations, and deletion SLAs;
- an external deletion-request register;
- actual quarterly restore/erasure drill records.

These require operator action, not code. **One new code-level gap belongs to this
finding and is raised separately as BK-008 below**: the app makes an unconditional
third-party request to Google Fonts on every launch, which the notice does not
disclose.

**BF-006 — Automated coverage for product-critical behaviour (was High; largely
closed, residual is observational).**

Coverage is now substantial and real: 38 client tests spanning game rules,
recurrence, SQLite fallback/corruption, sync cache, credential storage, language
parity, and accessibility contracts; 53 server tests spanning schema validation,
governance, redemption transitions, child auth, retention, projections, and route
registration; plus a real-PostgreSQL erasure integration suite and a native Android
emulator journey (`scripts/android-native-smoke.sh`, wired into
`.github/workflows/android-debug.yml`).

Residual, and the reason this stays open:

- The native emulator journey is path-filtered to `src/**`, `public/**`, build config
  and the script itself. Changes confined to `server/**`, `docs/**` or
  `.github/workflows/ci-deploy.yml` never exercise it. Its first green execution
  still needs confirming from the Actions history — this audit could not observe it.
- The PostgreSQL integration suite is skipped whenever `TEST_DATABASE_URL` is absent,
  so it passes silently by default outside CI. A local run reports "1 skipped" with
  no warning that the erasure lifecycle went untested.
- **The coverage has a shape problem that this audit exposes directly.** BK-001 and
  BK-003 below are defects in the client's server-state projection — the single most
  consequential pure function in the codebase (`src/online/gameSync.ts`) — and
  `gameSync.test.ts` does not exercise the state transitions that break. Extending
  coverage into projection behaviour over *sequences* of syncs, not single payloads,
  is the remaining work.

**BF-022 — Client build dependencies (was Low; status note now stale).**

The tracker states three High findings "remain confined to Capacitor/Deploid
development dependency trees pending upstream releases". Upstream has since shipped:

| Package | Installed | Fixed in | Path |
| --- | --- | --- | --- |
| `sharp` | 0.34.5 (via this repo's own `overrides`) | 0.35.0+ (latest 0.35.3) | `@deploid/cli` → `sharp` |
| `brace-expansion` | 5.0.8 | fix available | `@capacitor/cli` → `rimraf` → `glob` → `minimatch` |

`sharp` is held at 0.34.x by this repository's `overrides: { "sharp": "^0.34.4" }` in
`package.json` — not by upstream. Widening that override to `^0.35.3` and adding a
`brace-expansion` override clears all three. Both are build-time only and CI gates the
toolchain at `--audit-level=critical`, so nothing is failing; the note is simply no
longer accurate.

## 5. New findings

### BK-001 — Lifetime career XP is destroyed once a household syncs its first chore

**Severity:** High
**Areas:** Synchronization, data integrity, player progression

`serverSyncToGameState` derives each fighter's `careerXp` by summing the damage of
the chore completions present in the client's event cache, and only falls back to the
server's `career_xp_cached` when a fighter has **no** completion events at all:

```ts
careerXp: careerXp.get(fighter.id) ?? numberValue(
  sync.mutable.fighters.find((row) => stringValue(row.id) === fighter.id)?.career_xp_cached,
)
```

The event stream begins at household creation. All XP accumulated locally before the
household went online lives only in `career_xp_cached` (seeded at bootstrap from the
local save). The moment a fighter's first completion is synced, the `??` fallback is
bypassed and their lifetime XP is replaced by the damage of that single chore.

Career XP drives the level curve, level titles, and the MVP badge, so the visible
effect is that every fighter's level collapses to 1 shortly after the family connects
an account — permanently, because the next configuration push writes the collapsed
value back.

Coins do not suffer this because bootstrap writes an `adjustment` wallet transaction
that lives in the event stream; victories do not because `households.victories_baseline`
is added back. Career XP has neither.

**Evidence:** `src/online/gameSync.ts:196-200`, `src/online/gameSync.ts:244-250`;
`server/src/householdRoutes.ts:115-132` (bootstrap seeds `career_xp_cached`);
`server/src/syncPushRoutes.ts:397-401` (increments it thereafter).

**Reproduction (executed against the real function during this audit):**

| Input | `fighters[0].careerXp` |
| --- | --- |
| `career_xp_cached: 5000`, no completion events | `5000` |
| `career_xp_cached: 5000`, one completion with `damage: 12` | `12` |

**Recommendation:**

- Introduce a `career_xp_baseline` on `fighters`, set at bootstrap and never
  incremented, and compute `baseline + sum(completions)` — mirroring the
  `victories_baseline` pattern that already works.
- Alternatively, stop deriving XP client-side and treat `career_xp_cached` as
  authoritative, dropping the event-sum path entirely.
- Add a projection test that applies two successive sync payloads and asserts XP is
  monotonic.

### BK-002 — The durable sync cache grows without bound and silently stops persisting

**Severity:** High
**Areas:** Offline reliability, performance, scalability

The client keeps every synchronized event forever. `mergeSyncEvents` unions the
cached and incoming rows for all five streams and never evicts; `saveSyncEventCache`
re-serializes the entire union to `localStorage` on every pull — every 30 seconds
while the app is visible. Avatars (up to 512 KiB each, base64-expanded) and the full
mutable configuration are cached to the same 5–10 MB origin quota.

Three compounding consequences:

1. **Unbounded growth.** A family completing 20 chores a day accumulates roughly
   7 300 completion rows a year, plus wallet transactions, victories, resets, and
   redemptions. At ~250 bytes of JSON per row this passes 2 MB within a year, on top
   of avatars that can occupy several megabytes on their own.
2. **Silent failure at the quota.** Every write is wrapped in `catch { }` with a
   comment saying it will refetch next time. It does — forever. Once the quota is
   exceeded the cache stops advancing, so `syncCursors` keeps returning the same
   stale cursor and every subsequent pull re-downloads the entire tail of history.
   This is precisely the BF-009 failure mode, reintroduced with no user-visible
   signal and no diagnostic event.
3. **Per-sync CPU cost grows linearly.** `serverSyncToGameState` runs
   `completions.filter(...)` once per boss over the whole history, then filters again
   for the log. With ten bosses and ten thousand completions that is ~10⁵ comparisons
   plus a full JSON round-trip, every 30 seconds, on a phone.

**Evidence:** `src/online/syncCache.ts:85-93` (unbounded merge), `:110-112` (swallowed
write), `src/online/avatarCache.ts:34-36`, `src/online/configurationCache.ts:55-62`,
`src/online/gameSync.ts:202-238` (per-boss full-history scans),
`src/App.tsx:97` (30-second interval).

**Recommendation:**

- Prune the event cache to what the projection actually needs: the current cycle per
  boss, the wallet running balance, the last N redemptions. Persist a compacted
  balance/XP snapshot plus a cursor instead of raw history.
- Surface a `recordDiagnostic({ area: 'storage', outcome: 'error' })` when a cache
  write fails, and treat repeated failures as a user-visible persistence warning —
  the mechanism already exists for SQLite (`shouldShowPersistenceWarning`).
- Move avatar bytes out of `localStorage` into the SQLite database that the app
  already runs.
- Index completions by boss/cycle once per sync rather than re-filtering per boss.

### BK-003 — Using a freshly redeemed voucher is permanently rejected and reverts

**Severity:** Medium
**Areas:** Economy, offline behaviour, user-visible correctness

Optimistically created vouchers are given a local id of
`String(Date.now() + Math.random())`, e.g. `"1785072041123.4817"`. `useVoucher` sends
that value as `redemptionId`, and the server interpolates it into a `uuid` comparison.
PostgreSQL raises `22P02 invalid_text_representation`, the per-mutation catch converts
it to `outcome: 'rejected'`, and `applyMutationResults` quarantines the mutation
permanently.

The user sees the voucher marked used, then sees it flip back to unused on the next
pull, with no explanation. `rejectedMutationCount` is incremented and never clears.

This only affects the window before the first pull that replaces the optimistic
voucher with the server row (whose `vid` *is* a UUID) — but that window is exactly
"redeem a reward and immediately hand it in", which is the normal usage pattern.

**Evidence:** `src/store/GameContext.tsx:742` and `:761` (local `vid`), `:793`
(`queueMutation('reward_redemption_update', { redemptionId: vid, … })`),
`server/src/syncPushRoutes.ts:549-556`, `src/online/syncQueue.ts:19-25`.

**Recommendation:** Reuse the mutation id returned by `enqueueMutation` (already a
`crypto.randomUUID()`) as the optimistic voucher's `vid`, so the local and server rows
share an identity from the start. Additionally, treat a `22P02` on a client-supplied
id as a validation rejection with an actionable message rather than a generic
`mutation_rejected`.

### BK-004 — Adult login and registration have no route-specific rate limit

**Severity:** Medium
**Areas:** Authentication, brute-force protection

Every other credential-bearing route carries an explicit limit: child login and child
pairing use `childAuthRateLimit`, password reset request is 5/hour, reset confirm
10/hour, verification resend 5/hour, invites 10/hour. `/api/auth/login` and
`/api/auth/register` carry none, so they inherit only the global
`RATE_LIMIT_MAX ?? 300` per minute per IP — 432 000 password attempts per day from a
single address, against `scrypt` hashes with no account lockout and no failed-attempt
counter (child PINs get both).

Registration is un-throttled on the same limit, and each call sends a verification
email, making it a usable mail-flooding primitive against an arbitrary address.

Registration also leaks account existence: a duplicate email surfaces PostgreSQL
`23505`, which `publicApiError` maps to `409 { code: 'conflict' }`. The password-reset
flow is deliberately enumeration-resistant (`return { accepted: true }` for unknown
addresses); registration undoes that.

**Evidence:** `server/src/authAccountRoutes.ts:32` and `:53` (no `config.rateLimit`),
compare `:73`, `:92`, `:125`, `:150`, `:201`; `server/src/apiErrors.ts:39`;
`server/src/index.ts:47-50`.

**Recommendation:** Add per-route limits keyed on both IP and submitted email; add a
progressive failed-attempt delay or lockout for adult accounts equivalent to the child
PIN policy; return a neutral `202 accepted` from registration and deliver either a
"welcome" or a "someone tried to register with your address" email.

### BK-005 — REST configuration routes bypass the configuration-revision invariant

**Severity:** Medium
**Areas:** Synchronization integrity, authorization

BF-001 was fixed by making `configuration_replace` assert an `expectedRevision` under
a row lock. That guard is only sound if *every* configuration write bumps
`households.configuration_revision`. Nine authenticated routes do not:

- `POST|PATCH|DELETE /api/households/:id/bosses[/:bossId]`
- `POST|PATCH|DELETE /api/households/:id/chores[/:choreId]`
- `POST|PATCH|DELETE /api/households/:id/rewards[/:rewardId]`
- `POST|PATCH|DELETE /api/households/:id/fighters[/:fighterId]`
- `PATCH /api/households/:id`

Each bumps only the per-row `version`. A device holding a snapshot taken before any of
these calls will still match the household revision, pass the staleness check, and
soft-delete the newly created rows. `DELETE /children/:fighterId` gets this right
(`householdRoutes.ts:716-719`), which shows the intent.

Separately, `POST /api/households/:id/fighters` writes `body.userId` straight into
`fighters.user_id` with no check that the referenced user is a member of the
household (`householdRoutes.ts:442-452`). Every other claim path — invite acceptance,
child creation — validates membership first.

Mitigating: no shipped client calls any of these routes. All configuration flows
through `configuration_replace`. The surface is nonetheless live, authenticated, and
documented in `docs/api.md`.

**Evidence:** `server/src/gameplayRoutes.ts` (all handlers),
`server/src/householdRoutes.ts:419-493`.

**Recommendation:** Bump `configuration_revision` in the same statement as any
configuration mutation — ideally via a database trigger on `bosses`, `chores`,
`rewards`, `fighters` and `households` so no future route can forget. Reject or ignore
a client-supplied `userId` on fighter creation. If these routes are genuinely unused,
delete them; unused authenticated write surface is pure liability.

### BK-006 — Hardcoded Norwegian in the voucher confirmation

**Severity:** Medium
**Areas:** Localization

`flash('Brukt' + (entry ? ': ' + entry.title : ''))` — English users are told "Brukt".
This is the only surviving hardcoded user-facing string outside seed content; a full
sweep of `src/` found every other candidate to be a correct bilingual ternary or
intentionally-as-authored Norwegian domain data. It is a small regression of BF-017,
which was closed with a language-parity test that only covers the catalogue, not
`flash()` call sites.

**Evidence:** `src/store/GameContext.tsx:799`.

**Recommendation:** Add `voucherUsed` to `Strings` and both tables in
`src/game/i18n.ts`. Extend the parity test to assert that no string literal reaches
`flash(...)`.

### BK-007 — `known_avatar_hashes` is unbounded on the client and hard-capped on the server

**Severity:** Medium
**Areas:** Synchronization reliability

The client sends the hash of every cached avatar on every pull. The server rejects the
parameter outright — 400, no partial handling — when it exceeds 50 entries
(`syncPullRoutes.ts:49`) or 6 000 characters (`routeSchemas.ts:120`, ≈56 entries at
106 characters each). Bootstrap permits 100 fighters
(`routeSchemas.ts:73`).

A household above ~50 avatars therefore gets a permanently failing pull. There is no
degradation path: the client has no branch that retries with fewer hashes or omits the
parameter, so synchronization stops entirely for that household.

**Evidence:** `src/online/api.ts:475`, `src/online/avatarCache.ts:12-18`,
`server/src/syncPullRoutes.ts:45-57`, `server/src/routeSchemas.ts:120`.

**Recommendation:** Cap the client at the server's limit and prefer the fighters whose
avatars are actually rendered; on a `known_avatar_hashes must be valid` rejection,
retry once without the parameter. Better: move avatar freshness onto the configuration
revision, which is already exchanged, and delete the parameter.

### BK-008 — Google Fonts are fetched at runtime by an offline-first children's app

**Severity:** Medium
**Areas:** Privacy, offline reliability

`index.html` preconnects to `fonts.googleapis.com` and `fonts.gstatic.com` and loads
`Press Start 2P` and `Space Grotesk` from them; the CSP explicitly allows both hosts.
There is no `@font-face` fallback in `src/styles.css`.

Two problems:

- **Offline.** The product is described as "fully functional offline" and ships as a
  native Android package. On a first launch without connectivity — the exact scenario
  the local-first architecture exists for — the arcade typography that carries the
  entire visual identity silently falls back to system fonts.
- **Privacy.** Every launch discloses the device IP and User-Agent to a third party.
  `public/privacy.html` names no third parties or processors at all. For a Norwegian
  product that stores children's names, avatars and activity, embedding remote Google
  Fonts is the specific pattern that has drawn GDPR enforcement in the EU. This is a
  concrete, code-level instance of BF-005's outstanding "document processors and
  hosting arrangements" item.

**Evidence:** `index.html:3` (CSP `font-src`/`style-src` allowances), `:16-22`;
`src/styles.css` (no `@font-face`); `public/privacy.html` (no third-party section).

**Recommendation:** Self-host both fonts as static assets, drop
`fonts.googleapis.com`/`fonts.gstatic.com` from the CSP, and remove the preconnects.
This fixes the offline gap and removes the disclosure question entirely. If remote
fonts are kept for any reason, the privacy notice must name Google as a recipient.

### BK-009 — One malformed payload id still fails an entire sync batch

**Severity:** Low
**Areas:** Offline behaviour, reliability

BF-002 moved each mutation into its own transaction with its own `catch`. Two
statements were left outside that `try`:

```ts
for (const mutation of mutations) {
  const item = requireObject(mutation);
  const mutationId = optionalString(requireObject(item.payload).id);
  try {
```

`optionalString` throws `Expected string value` for a non-string, non-null `id`. The
throw escapes the loop, reaches the error handler, and returns 400 for the whole
request — so every other mutation in the batch is discarded and retried indefinitely.
This is the original queue-poisoning shape, narrowed to a much smaller trigger but not
closed. The route schema constrains `payload` to an object but places no constraint on
`payload.id`.

**Evidence:** `server/src/syncPushRoutes.ts:74-77`, `server/src/routeSchemas.ts:132-138`,
`server/src/requestValidation.ts:27-34`.

**Recommendation:** Move the `mutationId` extraction inside the `try`, defaulting to
`null`, so a malformed item is reported as one rejected result. Add
`id: { type: 'string' }` to the payload schema.

### BK-010 — Household-device pairing claim is the least protected credential path

**Severity:** Low
**Areas:** Authentication, brute-force protection

`POST /api/pairings/claim-household-device` hands out a household device token, which
grants full household sync access — read and write — with no user login and no
expiry short of revocation. It is the most powerful credential the system issues, and
it is the only credential route with no route-specific rate limit and no lockout;
child pairing, which is strictly less privileged, has both.

The code itself is weaker than it looks:

```ts
randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
```

The trailing `.toUpperCase()` folds the 62-symbol base64url alphabet onto 36 symbols
*after* generation, so 64 bits of entropy are compressed into at most ~41 bits of
code space. Roughly 0.03% of codes lose characters to the `-`/`_` strip and end up
shorter than 8 characters. A 15-minute expiry keeps this from being exploitable today,
but the margin is thinner than the design implies.

**Evidence:** `server/src/invitationRoutes.ts:31-33`, `:140-156`; compare
`server/src/authAccountRoutes.ts:201` (`config: { rateLimit: childAuthRateLimit }`).

**Recommendation:** Generate the code from an explicit uppercase alphabet
(`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, Crockford-style, ambiguity-free) at a fixed
length; add a route-specific rate limit and a per-pairing attempt counter mirroring
`fighter_credentials`.

### BK-011 — Secret-lookup columns are neither unique nor indexed

**Severity:** Low
**Areas:** Database design, performance

`sessions.token_hash` is correctly `not null unique`. The other three credential
lookup columns are not:

| Column | Constraint | Lookup query | Supporting index |
| --- | --- | --- | --- |
| `device_pairings.code_hash` | `not null` only | `where role = … and code_hash = … and claimed_at is null` | none (`device_pairings_lookup` is on `household_id, role`) |
| `household_invites.token_hash` | `not null` only | `where token_hash = … and accepted_at is null` | none (`household_invites_lookup` is on `household_id, lower(invited_email)`) |
| `devices.token_hash` | nullable, no constraint | `where household_id = … and kind = 'household' and token_hash = …` | partial index on `household_id` only |

Every pairing claim and invite acceptance sequentially scans its table. Retention keeps
these tables small, so the practical impact today is negligible — but a missing unique
constraint on a credential column is a correctness property, not a performance one.

**Evidence:** `server/schema.sql:106`, `:119`, `:180`, `:188`, `:196`, `:204`.

**Recommendation:** Add unique indexes on `device_pairings.code_hash`,
`household_invites.token_hash`, and a partial unique index on `devices.token_hash`
where it is not null, in a new numbered migration.

### BK-012 — Data minimization is inconsistent between the sync and config endpoints

**Severity:** Low
**Areas:** API design, data minimization

BF-011 was closed by introducing `syncProjection.ts` allowlists and explicit column
lists in `/api/sync/pull`. The endpoints that return the same entities elsewhere still
use `select *`:

- `GET /api/households/:id/config` — `select * from households`, `household_members`,
  `f.*` from fighters, `bosses`, `chores`, `rewards`.
- `GET /api/me` — `select h.*` from households.
- `GET /api/households/:id/export` — `select *` across fourteen tables (this one is
  passed through `privacyExportRows`, so it is filtered; the other two are not).

Nothing secret leaks — no token or PIN hash is in these tables — but internal columns
(`created_by_user_id`, `version`, `deleted_at`, `configuration_revision`) become part
of an unversioned client contract, which is the exact reasoning BF-011 was closed on.

**Evidence:** `server/src/householdRoutes.ts:261-297`,
`server/src/authAccountRoutes.ts:304-321`.

**Recommendation:** Route both through `publicSyncRows` or an equivalent projection.

### BK-013 — Minor hardening notes

**Severity:** Low

- `metricsAuthorized` compares the bearer token with `===`
  (`server/src/observability.ts:41-43`). Use `timingSafeEqual` on equal-length buffers
  for consistency with the rest of the credential handling.
- `enqueueMutation` calls `setState` from inside a `setPendingMutations` updater
  (`src/online/OnlineContext.tsx:460-468`). Updater functions must be pure; React may
  invoke them twice in StrictMode. The count it writes (`next.length`) is also
  unfiltered and is corrected a tick later by the effect at `:350-356`.
- `gameConfigurationSignature` (`src/store/GameContext.tsx:864-880`) JSON-stringifies
  every fighter's full base64 avatar on every game-state change — i.e. on every
  attack and every damage number. Hash the avatar once and sign the hash.
- The pull loop `while (pageHasMore)` (`src/online/OnlineContext.tsx:509-521`) has no
  iteration bound; a server-side `hasMore` bug would spin indefinitely.
- `fighters.streak` is written at bootstrap and never updated by any server path, so
  the streak feature is inert for online households.

## 6. Positive observations

Worth preserving, beyond the prior audit's list:

- The per-mutation transaction boundary with typed `accepted`/`duplicate`/`conflict`/
  `rejected` outcomes is a genuinely good design, and the client's quarantine logic
  matches it correctly.
- `entityId` (deterministic UUIDv5 from a household-scoped client id) cleanly solves
  the local-to-server identity problem and makes the bootstrap idempotent.
- `validatedAvatar` verifies MIME, magic bytes, canonical base64, size, and a
  caller-supplied SHA-256 — noticeably stronger than typical.
- The advisory-lock-guarded bootstrap (`pg_advisory_xact_lock(hashtext(userId))`)
  correctly makes household creation idempotent across a lost HTTP response.
- The `reward_redemptions_bump_server_seq` trigger is the right way to give status
  transitions a fresh cursor position.
- Actions are pinned by commit SHA, the API image is promoted by digest, and the
  deploy script restores the previous image on a failed readiness check.

## 7. Recommended order of work

1. **BK-001** — career XP baseline. Silent, permanent, affects every household that
   goes online. Smallest fix with the largest user-visible payoff.
2. **BK-002** — bound and compact the client sync cache; report storage failures.
3. **BK-003** and **BK-006** — voucher identity and the Norwegian toast. Both are
   small and both are visible in ordinary use.
4. **BK-004** — rate-limit and de-enumerate the adult credential routes.
5. **BK-008** — self-host the fonts. Closes an offline gap and a privacy disclosure
   in one change.
6. **BK-005**, **BK-007**, **BK-009** — invariant and robustness repairs.
7. **BK-010** through **BK-013** — hardening; fold the schema changes into one
   migration.
8. **BF-022 refresh** — widen the `sharp` override to `^0.35.3`, add a
   `brace-expansion` override, and correct the tracker note.
9. **BF-006 residual** — confirm the native journey's first green run, make the
   PostgreSQL suite fail loudly rather than skip silently, and extend
   `gameSync.test.ts` to multi-sync sequences (which is what would have caught
   BK-001).
10. **BF-005 residual** — organizational; unblocked by nothing in this repository
    except BK-008.

## 8. Conclusion

The prior audit's remediation programme was executed well and its technical
recommendations are genuinely in place. The risk profile has moved: the synchronized
product no longer has missing authorization or missing durability controls, but it has
two silent data-integrity defects in the client's projection of server state — lost
career XP and an unbounded cache that stops persisting — that the current test shape
cannot see, because those tests assert on single payloads rather than on sequences of
syncs over time.

Fixing BK-001 and BK-002, and extending the projection tests to cover state evolution,
is the highest-value next step. Nothing found in this review argues against the
architecture; the local-first SQLite model, the event-sourced backend, and the
per-mutation transaction boundary remain sound foundations.
