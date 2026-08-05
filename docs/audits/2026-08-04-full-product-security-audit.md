# Boss Kamp Full Product, Sync, Security, and Operations Audit

| Field | Value |
| --- | --- |
| Audit date | 2026-08-04 |
| Repository | `vardirhq/boss-fight` |
| Audited branch | `main` |
| Audited commit | `e157275104f88edc7228d19a088067f6c5a3055c` |
| Application version | `1.0.0` |
| Audit type | Source, architecture, dependency, CI/CD, and read-only production health review |
| Report status | Final |

## 1. Executive summary

Boss Kamp has a strong small-product foundation: the local-first game is compact,
the production PWA and API build successfully, the server uses hashed credentials
and transactional economy writes, and recent fixes correctly stabilized fighter
ordering, fighter ownership, and the boss-introduction overlay.

The synchronized product is not yet production-hardened. The highest risks are:

1. An offline parent can upload a stale whole-household configuration and overwrite
   or soft-delete newer changes made by another device.
2. One permanently rejected offline mutation can block every later mutation on the
   device because the complete batch is retried as one transaction.
3. Reward redemption status and approval identity are trusted from the client,
   allowing a modified client to create a free or forged redemption.
4. A parent can suspend the household owner and revoke that owner's sessions beyond
   the current household.
5. Child names, avatars, and activity are stored online without a complete privacy,
   retention, export, and erasure lifecycle.
6. There are no automated tests for game rules, synchronization, authorization,
   economy integrity, database behavior, offline recovery, or the user interface.

The audit recommends treating synchronization integrity, economy authorization,
database migrations, tests, and child-data governance as release work rather than
long-term polish.

## 2. Scope

The review covered:

- React application state and product behavior
- local SQLite/OPFS persistence and fallback behavior
- offline mutation queuing and online synchronization
- API authentication, authorization, validation, and error handling
- household roles and fighter ownership
- battle, wallet, and reward integrity
- PostgreSQL schema and data constraints
- child accounts, invitations, PIN login, and device pairing
- PWA caching and client performance
- accessibility and localization
- dependency health
- GitHub Actions, deployment, Android packaging, and release automation
- operational readiness, migrations, backup expectations, and observability
- read-only production health and metadata endpoints

## 3. Methodology and limitations

The audit used source inspection, data-flow tracing, route-by-route authorization
review, dependency inspection, compilation, release-tool validation, and safe
read-only production checks.

No authenticated production mutations, destructive tests, account creation,
penetration testing, database writes, migration execution, backup restoration, or
Android device instrumentation were performed. Production infrastructure outside
the repository, including the Caddy configuration, firewall, PostgreSQL role grants,
host backups, and secret configuration, was not available for direct inspection.

Privacy observations identify missing engineering and product controls. They are
not a substitute for advice from qualified Norwegian privacy counsel.

## 4. Severity model

| Severity | Meaning |
| --- | --- |
| Critical | Direct compromise or widespread irreversible loss is likely and immediately exploitable |
| High | Credible data loss, authorization bypass, economic abuse, persistent sync failure, or launch-blocking operational risk |
| Medium | Material reliability, privacy, performance, accessibility, or maintainability weakness |
| Low | Hardening or quality issue with limited immediate impact |

No issue was classified as Critical. Several High findings should be resolved before
the synchronized product is treated as generally production-ready.

## 5. Validation results

| Check | Result |
| --- | --- |
| Root TypeScript check | Passed |
| PWA production build | Passed |
| Server TypeScript build | Passed |
| Release metadata check | Passed |
| Release tooling tests | 5 passed, 0 failed |
| Root dependency audit | 12 high, 3 moderate, 0 critical |
| Server dependency audit | 0 known vulnerabilities |
| Production `/health` | Responding successfully during audit |
| Production `/api/meta` | Responding successfully during audit |
| Existing application/domain tests | None found |

The root audit findings are concentrated in Vite, Workbox, and their build-time
dependency trees. They do not indicate a confirmed production exploit in Boss Kamp,
but the current CI threshold ignores all root findings below Critical severity.

### 5.1 Remediation tracker

This tracker records work completed after the audit snapshot. The original findings
below remain unchanged so that the audit evidence is preserved. `Remediated` means
the reported risk has been addressed and merged; `In progress` means useful work has
landed but the recommendation is not yet satisfied in full.

| Finding | Status | Evidence / remaining work |
| --- | --- | --- |
| BF-001 | Remediated | Household configuration revisions reject stale snapshots; merged in [PR #36](https://github.com/vardirhq/boss-fight/pull/36) (`c423064`). |
| BF-002 | Remediated | Mutations commit independently and rejected items are quarantined without blocking later work; [PR #36](https://github.com/vardirhq/boss-fight/pull/36). |
| BF-003 | Remediated | Redemption metadata, status, identity, cost, charging, refunds, and final transitions are server-authoritative; [PR #37](https://github.com/vardirhq/boss-fight/pull/37) (`087f84f`). |
| BF-004 | Remediated | Role hierarchy, last-owner protection, explicit claimed-fighter governance, and household-scoped session revocation implemented in PR #39. |
| BF-005 | In progress | A bilingual privacy notice, versioned child authorization, household export, transactional child/household/adult-account erasure, transient-record/deleted-avatar retention, and real-PostgreSQL erasure-route coverage are implemented. Counsel review, active-data and backup lifecycle rules, processor details, and backup restoration/erasure testing remain. |
| BF-006 | In progress | Game rules, recurrence, elite/rare encounters, progression, seed integrity, bootstrap/projection, sync queue, reward-integrity, household-governance, and PostgreSQL privacy-erasure integration tests now run in CI. The obsolete PWA service worker/manifest pipeline has been removed to match the native-only product scope. Broader database/concurrency integration, native Android offline/restart/upgrade coverage, and UI/accessibility journeys remain. |
| BF-007 | Remediated | Locked, checksum-verified, versioned migrations now gate deployment after a pre-deploy backup; bootstrap, authoring, and rollback procedures are documented in PR #40. |
| BF-008 | Remediated | Android credentials use Keystore-backed AES-GCM storage with legacy-token migration and browser-record scrubbing; a restrictive CSP limits script and connection origins in PR #41. Active-session listing, individual revocation, and absolute/idle token lifetimes are now implemented. |
| BF-009 | In progress | The client durably merges household event streams and sends independent server-sequence cursors; reward status transitions now receive fresh sequences, so all five event streams avoid repeated full-history downloads. Bounded pagination, revision-gated mutable configuration, and hash-gated avatar transfer remain. |
| BF-010 | Remediated | Client synchronization uses a single-flight coordinator with a pending rerun; [PR #36](https://github.com/vardirhq/boss-fight/pull/36). |
| BF-011 | Remediated | Sync pulls use explicit SQL columns and response-boundary allowlists; credential hashes, internal actor/revocation metadata, and unused membership/device/reward collections are excluded and covered by regression tests. |
| BF-012 | Remediated | Invalid pairing PIN attempts commit before the route returns 401, the eighth failure starts the database lockout, and both child-authentication routes have explicit per-IP limits and regression tests. |
| BF-013 | Remediated | Adult email validation and verification, enumeration-resistant password recovery, explicit production CORS origins, opt-in proxy trust, defensive API headers, non-root containers, account deletion UI, active-session management, bounded absolute/idle token lifetimes, and non-disclosing health responses are implemented. |
| BF-014 | Remediated | Android workflows install locked project dependencies, use Deploid 2.1.1 from the repository, standardize on Node 22, pin third-party actions by commit SHA, and require signed builds to run from the immutable release tag; workflow regression tests enforce the contract. |
| BF-015 | Remediated | CI builds and scans a commit-versioned API image, deployment promotes its immutable digest without rebuilding, and the tested deploy helper retains and automatically restores the previous image when readiness fails. |
| BF-016 | Remediated | Critical flows use keyboard-native controls, programmatically named fields, focus-managed dialogs, focus indicators, reduced-motion support, accessible disabled-state explanations, and live status/error/gameplay announcements, protected by accessibility contract tests. |
| BF-017 | Remediated | Language-key parity and English regression tests cover generated labels; reward definitions, voucher and transfer copy, shared attribution, fallback names, level titles, and weekdays now follow the active language across local and synchronized state. |
| BF-018 | Remediated | Database writes return explicit results; fallback, corrupt-restore, and failed-write states remain visibly announced with retry and SQLite backup actions, with quota and corruption regression tests. |
| BF-019 | Open | Backend route/service decomposition remains. |
| BF-020 | Open | Centralized strict request/response schemas remain. |
| BF-021 | Open | Client and operational observability remain. |
| BF-022 | Open | Planned build-dependency upgrades remain. |

## 6. Detailed findings

### BF-001 — Stale configuration replacement can destroy newer household changes

**Severity:** High  
**Areas:** Synchronization, data integrity

Configuration changes are represented as a complete `configuration_replace`
mutation. The server updates everything present in the submitted snapshot and
soft-deletes every fighter, boss, chore, or reward missing from it.

The schema maintains row versions, but the client does not submit an expected
configuration revision and the server does not reject stale writes. On reconnect,
the client pushes its queued configuration before pulling the current server state.

Example failure:

1. Parent A goes offline with configuration revision 10.
2. Parent B adds a fighter and edits a boss, creating revision 11.
3. Parent A edits an unrelated chore while offline.
4. Parent A reconnects and uploads its complete revision-10 snapshot.
5. Parent B's fighter is absent from that snapshot and is soft-deleted.

**Evidence:**

- `src/online/OnlineContext.tsx:396-426`
- `server/src/index.ts:1483-1698`

**Recommendation:**

- Introduce a monotonic household configuration revision or ETag.
- Require `expectedRevision` on every configuration write.
- Return `409 conflict` for stale updates.
- Pull before uploading an offline configuration snapshot.
- Replace whole-state writes with explicit create/update/delete mutations.
- Protect claimed fighters from implicit deletion.

### BF-002 — One rejected mutation permanently poisons the offline queue

**Severity:** High  
**Areas:** Offline behavior, synchronization, reliability

All queued mutations are processed inside one SQL transaction. A single domain
error rolls back the complete batch. The client retains the entire queue, increments
attempt counters, and retries it indefinitely. It does not pull authoritative state
after the push fails.

Permanent rejection can occur during normal use when:

- a recurrence cycle changes while the device is offline;
- a non-repeatable chore was completed on another device;
- a reset sequence loses a race;
- a wallet balance changes;
- a fighter becomes linked to another account.

Later valid actions remain trapped behind the invalid action.

**Evidence:**

- `server/src/index.ts:1469-2035`
- `src/online/OnlineContext.tsx:396-440`

**Recommendation:**

- Process mutations independently or use per-mutation savepoints.
- Return explicit `accepted`, `duplicate`, `conflict`, and `rejected` results.
- Quarantine permanent failures instead of retrying them forever.
- Display actionable conflict information to the user.
- Pull authoritative state even when one push item is rejected.

### BF-003 — Reward state and approval identity can be forged by the client

**Severity:** High  
**Areas:** Economy, authorization, audit integrity

The reward-redemption endpoint accepts `status` and `approvedByUserId` from the
client. The database accepts statuses including `pending`, `active`, `used`, and
`cancelled`. Wallet deduction occurs only when the caller submits `active`.

A modified client can therefore submit a redemption directly as `used` without a
wallet deduction and can attach an arbitrary approval identity.

**Evidence:** `server/src/index.ts:1951-2027`

**Recommendation:**

- Derive title, icon, cost, initial status, requester, and approver server-side.
- Ignore approval-related client fields.
- Define an explicit state machine for redemption transitions.
- Charge or reserve funds atomically at the correct transition.
- Add integration tests covering every status and role combination.

### BF-004 — A parent can suspend the owner and revoke unrelated sessions

**Severity:** High  
**Areas:** Authorization, household governance

Both owners and parents may suspend any fighter-linked user. The operation can
suspend the owner membership and revokes every session belonging to that user,
without limiting revocation to the current household.

The current configuration UI and full-replacement sync also permit one adult to
remove another claimed adult's fighter.

**Evidence:** `server/src/index.ts:952-1005`

**Recommendation:**

- Define and enforce a role hierarchy.
- Prevent parents from suspending, unlinking, deleting, or demoting owners.
- Require at least one active owner at all times.
- Scope administrative device/session revocation to the household.
- Use separate, explicit operations for account governance and fighter deletion.

### BF-005 — Child-data lifecycle and privacy controls are incomplete

**Severity:** High  
**Areas:** Privacy, product governance, operations

Online child profiles may contain a name, avatar, household relationship, device
activity, and a detailed chore/activity history. The application does not provide a
complete user-facing privacy notice, recorded authorization/notice version, data
export, child deletion, account deletion, retention schedule, or tested erasure
process.

The architecture document explicitly identified this work before the online model
was implemented.

**Evidence:**

- `docs/accounts-and-sync.md:719-727`
- `server/schema.sql`

**Recommendation:**

- Confirm the lawful basis and authorization model with qualified counsel.
- Publish a clear, age-appropriate privacy notice.
- Record who created/authorized a child account and the notice version.
- Implement household export and child/account erasure.
- Define retention for invitations, sessions, devices, avatars, and activity events.
- Document processors and hosting arrangements.
- Test deletion against primary storage and backup procedures.

### BF-006 — There is no automated coverage for product-critical behavior

**Severity:** High  
**Areas:** Testing, regression prevention

The repository contains five tests for release preparation and no application,
server, database, synchronization, or UI tests.

Missing coverage includes:

- recurrence and cycle boundaries;
- elite and rare boss behavior;
- fighter ownership and role matrices;
- owner-protection rules;
- child PIN lockout and pairing;
- battle idempotency and concurrent final blows;
- wallet transfers and redemptions;
- stale configuration conflicts;
- offline queue recovery;
- SQLite migrations and fallback persistence;
- PostgreSQL schema/API integration;
- PWA offline and update behavior;
- accessibility and critical user journeys.

**Recommendation:** Establish unit, API integration, database integration, and a
small end-to-end suite before further broad feature expansion.

### BF-007 — Production schema changes have no migration path

**Severity:** High  
**Areas:** Database operations, deployment

`server/schema.sql` is a current-state snapshot rather than a sequence of migrations.
The deployment workflow rebuilds the API container but does not migrate the database.
Application and schema versions can therefore diverge.

No automated pre-migration backup, forward-only migration policy, schema ledger,
rollback procedure, or restore drill is represented in the repository.

**Evidence:**

- `server/README.md:94-96`
- `.github/workflows/ci-deploy.yml:69-88`

**Recommendation:**

- Add numbered, immutable migrations and a migration ledger.
- Run migrations as a distinct deployment step.
- Make compatible expand/migrate/contract changes where rollback matters.
- Back up before schema changes and regularly test restoration.

### BF-008 — Long-lived native credentials are persisted in localStorage

**Severity:** High  
**Areas:** Authentication, native security

Bearer sessions and household-device tokens are stored in browser `localStorage`.
The API documentation recommends encrypted Android storage, but the packaged native
application uses the browser persistence path.

Any successful script injection into the application origin can extract long-lived
credentials. Household-device credentials are particularly sensitive because they
are designed to persist without a normal user login.

**Evidence:** `src/online/OnlineContext.tsx:137-243`

**Recommendation:**

- Store native credentials in platform-protected encrypted storage.
- Keep only non-sensitive online state in localStorage.
- Add a restrictive Content Security Policy.
- Add session/device listing and revocation.
- Consider shorter sessions plus renewable credentials.

### BF-009 — Sync repeatedly downloads the complete history and all avatars

**Severity:** Medium  
**Areas:** Performance, scalability

Every pull sends zero for every event cursor. The client therefore downloads and
reprocesses all chore completions, resets, victories, wallet transactions, and
redemptions every 30 seconds. Mutable configuration and base64 avatars are also
returned every time.

The client persists `lastSyncCursor`, but it is not used. The API has no pagination
or response-size bound.

**Evidence:**

- `src/online/api.ts:375-388`
- `src/App.tsx:71-94`
- `server/src/index.ts:1394-1466`

**Recommendation:**

- Persist and send a cursor for each event stream.
- Merge incremental events into a durable local event cache.
- Add pagination and server-side limits.
- Fetch configuration only when its revision changes.
- Fetch avatar bytes only when their hash changes.
- Optionally add Server-Sent Events as an invalidation signal while retaining REST
  as the durable synchronization protocol.

### BF-010 — Synchronization is not globally serialized

**Severity:** Medium  
**Areas:** Concurrency, client state

The 30-second scheduler has an in-flight guard, but immediate gameplay flushes,
configuration flushes, connectivity events, manual sync, and initial loading do not
all share that guard. Multiple pushes and pulls can overlap and responses can be
applied out of order.

**Recommendation:** Use one sync coordinator with a single-flight promise, pending
rerun flag, and monotonically checked response revision.

### BF-011 — Sync responses expose unnecessary internal database fields

**Severity:** Medium  
**Areas:** Data minimization, API design

The sync API returns `select *` results for households, household members, devices,
and other mutable tables. This includes internal fields such as token hashes,
revocation metadata, soft-delete timestamps, and implementation-specific columns.

The tokens are high entropy and their hashes are not directly reusable, but they
should not be part of a household client contract.

**Evidence:** `server/src/index.ts:1407-1427`

**Recommendation:** Define explicit public response objects and return only fields
required by the client.

### BF-012 — Child pairing PIN failures do not persist the intended lockout count

**Severity:** Medium  
**Areas:** Authentication, brute-force protection

The child-pairing route increments `failed_attempts` inside a transaction and then
throws. Throwing rolls back the transaction, including the failed-attempt update.
The direct child-login route performs its update outside such a rolled-back
transaction and behaves differently.

**Evidence:** `server/src/index.ts:479-529`

**Recommendation:** Persist the failed attempt in a separate transaction or return a
controlled failure result after committing the credential update. Add route-specific
rate limits and integration tests.

### BF-013 — Authentication and API hardening are incomplete

**Severity:** Medium  
**Areas:** Security hardening

Observed gaps include:

- adult registration does not validate email format;
- email verification and password recovery are absent;
- there is no account deletion or session-management UI;
- production CORS responds with a wildcard origin;
- `trustProxy` is enabled unconditionally;
- security headers are not configured in the API repository;
- the production container runs as root;
- health and metadata endpoints disclose internal service/database details.

Wildcard CORS is less severe here than in a cookie-authenticated application because
credentials are explicitly supplied as bearer headers, but production origins should
still be intentional and narrow.

### BF-014 — Android releases are not completely reproducible

**Severity:** Medium  
**Areas:** Supply chain, release integrity

Android workflows install the latest Deploid and Capacitor packages globally or with
`--no-save` at build time. Actions use mutable major-version tags, and workflows use
different Node major versions.

The finalize workflow dispatches the Android build with `--ref main` rather than the
release tag. If `main` advances before the build starts, release artifacts may not
match the tagged commit.

**Evidence:**

- `.github/workflows/android-release.yml`
- `.github/workflows/android-debug.yml`
- `.github/workflows/finalize-release.yml:80-90`

**Recommendation:** Pin packaging dependencies, standardize Node, pin Actions by
commit SHA where practical, and build from the immutable release tag.

### BF-015 — Deployment lacks automatic recovery and artifact promotion

**Severity:** Medium  
**Areas:** Operations, deployment

Production deploys by resetting the server checkout and building a new container on
the production host. A failed health check prints logs but does not restore the prior
image. The same source is rebuilt separately in CI and production rather than
promoting a tested immutable image.

**Recommendation:** Build and scan a versioned image in CI, deploy that immutable
artifact, retain the previous image, and automatically restore it if readiness fails.

### BF-016 — Accessibility support is incomplete

**Severity:** Medium  
**Areas:** User experience, accessibility

Examples include:

- clickable `div` cards without keyboard behavior;
- icon buttons without accessible names;
- inputs without associated labels;
- overlays without dialog semantics or focus management;
- disabled-fighter explanations available only through hover titles;
- no live announcements for sync status, damage, rewards, or errors;
- incomplete Escape-key handling and focus restoration.

**Recommendation:** Establish accessible primitives for buttons, cards, dialogs,
forms, alerts, and focus management, then run automated and keyboard/screen-reader
checks on critical flows.

**Remediation:** Completed. Clickable cards and full-screen actions now use native
buttons; icon controls and form fields have programmatic names; unavailable fighter
choices remain keyboard focusable and explain their restriction. A shared dialog
surface traps focus, closes on Escape, and restores focus for settings, confirmation,
account, boss, chore, and fighter overlays. Toasts, sync state, persistence errors,
battle damage, victories, and account errors use live-region semantics. Global
focus-visible and reduced-motion rules cover keyboard and OS preferences. Automated
contracts test focus wrapping, dialog adoption, named fields, and the absence of
non-keyboard click targets in critical flows.

### BF-017 — English mode still emits Norwegian product text

**Severity:** Medium  
**Areas:** Localization

Hard-coded Norwegian remains in reward, transfer, voucher, manager, default-name,
level-title, weekday, and shared-attribution paths.

**Evidence:**

- `src/store/GameContext.tsx`
- `src/game/logic.ts`
- `src/screens/managers.tsx`

**Recommendation:** Move all user-facing strings into the translation catalog and
add a test that scans or renders both supported languages.

**Remediation:** Completed. Product-generated labels now come from the bilingual
catalog, reward definitions are selected by language while retaining stable reward
IDs, and synchronized redemption records carry those IDs so historical titles can
be rendered in the active language. Language parity and focused English-mode tests
cover generated labels, level titles, weekdays, reward catalogs, and synchronized
redemptions. Household-configured boss, chore, fighter, and household names remain
user content and are intentionally displayed as authored.

### BF-018 — Persistence failure can be silent to the user

**Severity:** Medium  
**Areas:** Offline reliability

When OPFS is unavailable, the application exports the complete SQLite database into
localStorage. Quota or write failures are logged but not surfaced, and the calling
code treats the save as successful. The same pattern is used for several ordinary
persistence failures.

**Evidence:** `src/db/sqlite.ts:50-131`

**Recommendation:** Return explicit save status, display a persistent warning when
durability is unavailable, offer export/recovery, and test quota and corrupted-export
behavior.

**Remediation:** Completed. The SQLite boundary now returns explicit save results
and publishes persistence status changes to the application. A persistent bilingual
alert distinguishes unavailable OPFS, corrupt fallback restoration, and failed
writes, while offering retry and a downloadable copy of the current SQLite database.
Failed fallback restoration starts with a clean in-memory handle instead of silently
trusting corrupt data. Regression tests cover quota exceptions, corrupt exports, and
the empty fallback case.

### BF-019 — Backend responsibilities are concentrated in one route file

**Severity:** Medium  
**Areas:** Maintainability, reviewability

`server/src/index.ts` is approximately 2,050 lines and contains parsing,
authentication, authorization, household governance, synchronization, battle rules,
wallet accounting, redemption logic, and SQL.

This does not make the application inherently unsafe, but it makes authorization
omissions and transaction-boundary mistakes more difficult to see and test.

**Recommendation:** Extract schemas, services, authorization policies, sync mutation
handlers, and route modules while retaining explicit transaction boundaries.

### BF-020 — Validation relies on permissive manual coercion

**Severity:** Medium  
**Areas:** API correctness

Manual conversion permits ambiguous values. For example, `Boolean("false")` is true.
Numeric values are checked for finiteness but many domain ranges and string lengths
are not bounded consistently.

**Recommendation:** Define strict route schemas, reject rather than coerce incorrect
types, cap arrays and strings, validate MIME/avatar size, and derive sensitive fields
server-side.

### BF-021 — Client and operational observability are minimal

**Severity:** Low  
**Areas:** Supportability

Client persistence and sync failures are largely console warnings. There is no error
boundary, correlation identifier, structured client diagnostic export, or documented
alerting for API error rate, queue conflicts, mail failures, database saturation, or
deployment health.

**Recommendation:** Add privacy-conscious structured diagnostics, request IDs,
server metrics, deployment alerts, and a user-visible sync/conflict history.

### BF-022 — Client build dependencies need a planned upgrade

**Severity:** Low  
**Areas:** Dependencies, maintenance

The root dependency audit reports 15 findings, including findings in Vite, Workbox,
AJV, and transitive glob/minimatch packages. Most are development/build-time paths,
but CI currently allows High findings indefinitely.

The client build also reports a main JavaScript chunk above 500 KB minified. SQLite
adds an approximately 856 KB WASM asset; the complete build is approximately 6.1 MB.
Boss artwork is correctly excluded from the initial precache and loaded on demand.

**Recommendation:** Plan the Vite/PWA upgrade as a controlled PR, raise CI policy
after resolving known findings, and consider lazy-loading account/management screens.

## 7. Positive observations

The audit also identified several sound decisions worth preserving:

- The local-first SQLite model makes gameplay available without an account.
- OPFS is preferred over localStorage when supported.
- Server session and device tokens are stored as hashes.
- Passwords and child PINs use salted `scrypt` hashes.
- Economy and battle mutations use stable client-generated identifiers.
- Final blows are protected by a unique boss-victory constraint.
- Wallet credits and redemptions use append-only transaction records.
- Fighter ownership is enforced in both the UI and API after PR #34.
- Fighter ordering now has deterministic server and client tie-breakers.
- PWA boss artwork uses bounded runtime caching instead of bloating the app-shell
  precache.
- Production deployment includes a database-backed health check.
- Android workflows verify APK and AAB signatures.
- The dependency footprint is small relative to the product scope.

## 8. Recommended remediation program

### PR 1 — Synchronization integrity and queue recovery

- Add household configuration revisioning.
- Reject stale configuration replacements.
- Pull before reconciling offline configuration edits.
- Return per-mutation results.
- Add dead-letter/conflict handling.
- Serialize all client synchronization.
- Add sync and conflict integration tests.

### PR 2 — Economy and household authorization

- Make redemption state fully server-owned.
- Add explicit redemption transitions.
- Protect household owners.
- Scope administrative revocation to the household.
- Protect claimed fighters from implicit deletion.
- Add a complete role/action test matrix.

### PR 3 — Test and database foundation

- Add a PostgreSQL integration-test environment.
- Test idempotency, concurrent battle actions, wallet accounting, and child lockout.
- Add pure game-rule tests.
- Add SQLite migration/persistence tests.
- Add a minimal end-to-end household flow.

### PR 4 — Migrations and production operations

- Introduce numbered migrations and schema tracking.
- Add backup-before-migrate and restore documentation.
- Build and promote immutable server images.
- Add rollback automation, readiness checks, metrics, and alerts.

### PR 5 — Privacy and account lifecycle

- Add privacy and child-account information.
- Record authorization/notice versions.
- Add household export and erasure.
- Define retention and backup-erasure handling.
- Add session and device management.

### PR 6 — Credential and API hardening

- Use encrypted native credential storage.
- Add explicit response DTOs.
- Add security headers and deliberate CORS/proxy configuration.
- Add strict route schemas and input bounds.
- Run the container as a non-root user.

### PR 7 — Product quality and performance

- Implement incremental cursor-based pull.
- Add optional SSE invalidation for prompt cross-device updates.
- Complete localization.
- Repair accessibility primitives and flows.
- Upgrade Vite/PWA dependencies and split optional UI code.

## 9. Suggested release gate

Before calling synchronized household play production-ready, require:

- no stale configuration overwrite;
- no queue-wide failure from one rejected event;
- no client-controlled economy status or approval;
- enforced owner protection;
- versioned, tested database migrations;
- tested backup restoration;
- automated authorization, economy, and sync integration tests;
- an implemented child-data privacy, export, retention, and erasure lifecycle;
- encrypted credential storage in the native Android package.

## 10. Conclusion

Boss Kamp does not need a rewrite. Its local game model, small dependency surface,
and event-oriented backend are suitable foundations. The next phase should focus on
making synchronization conflict-aware and recoverable, moving all sensitive business
state decisions to the server, protecting household governance, and establishing the
tests and operational controls expected of a family application that stores child
activity.

The recommended first implementation is **PR 1 — Synchronization integrity and
queue recovery**, because it addresses the most immediate risks of household data
loss and permanently stuck devices.
