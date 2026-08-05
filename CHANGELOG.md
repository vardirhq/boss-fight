# Changelog

All notable production changes should be documented here.

This project uses semver-style version names for app releases and monotonically
increasing Android version codes for install/update compatibility.

## [Unreleased]

### Added

- Stop retransmitting unchanged avatar bytes by exchanging per-fighter content
  hashes and retaining only locally cached payloads that match the server hash.
- Persist synchronized gameplay events per household and send independent
  server-sequence cursors so recurring syncs download only new event history.
- Assign a fresh synchronization sequence to every reward-redemption status
  transition so redemption history can also use an incremental cursor safely.
- Verify ownership of new adult email addresses with emailed, hashed, single-use
  24-hour codes, resend controls, and a bilingual in-app confirmation flow.

- Add enumeration-resistant adult password recovery with emailed 30-minute
  single-use tokens, global session revocation after reset, and bilingual UI.
- Bound bearer sessions by both a 90-day absolute lifetime and a 30-day idle
  lifetime, with validated deployment overrides and inactive-session filtering.
- Let signed-in adults review active sessions, their recent use and expiry, and
  remotely revoke individual sign-ins—including the current device.
- Harden the API perimeter with validated adult email addresses, explicit CORS
  origins, opt-in proxy trust, defensive response headers, non-root containers,
  and health responses that disclose no database metadata.
- Exercise child, household, and adult-account erasure against an isolated real
  PostgreSQL database in CI, including schema migrations, sole-owner protection,
  retained anonymized records, and cascading identity cleanup.
- Let adults permanently erase their account, credentials, devices,
  memberships, and identifying game links after password/email confirmation,
  while protecting households that still depend on them as sole owner.
- Let household owners permanently erase all synchronized family data after
  confirming the exact household name and re-entering their current password,
  while preserving independent adult accounts.
- Enforce documented cleanup windows for expired invitations, pairings and
  sessions, revoked devices, and avatars belonging to deleted fighters, with
  startup gating and daily retries.
- Allow owners and parents to permanently erase a child identity, credentials,
  devices, avatar, and authorization record while retaining only de-identified
  gameplay and wallet history.
- Publish a bilingual privacy notice, record the responsible adult and notice
  version for new child logins, and let owners and parents download a
  credential-free JSON export of family configuration and activity history.

### Removed

- Remove the obsolete installable-PWA manifest, service worker, Workbox caches,
  and PWA build dependency; Boss Kamp is distributed as a native Android app.

## [1.0.1] - 2026-08-05

### Added

- Automated release preparation that updates application and Android versions,
  rolls changelog entries into a dated release, opens a release pull request,
  and starts the signed Android build after merge.
- Focused client and server synchronization tests, including CI coverage for
  queue recovery, configuration conflicts, and reward-redemption rules.
- An audit remediation tracker linking each finding to its current status and
  merged implementation evidence.
- Versioned, checksum-verified database migrations with deployment gating and
  documented backup and rollback procedures.
- Android Keystore-backed encrypted storage for session and household-device
  credentials, including migration from legacy browser storage and a restrictive
  application Content Security Policy.
- Product-critical regression tests for battle schedules and cycles, elite and
  rare encounters, progression, seed integrity, bootstrap validation, and server
  event-to-game-state projection.

### Fixed

- Hide the expected browser-storage fallback banner in native Android builds
  while retaining warnings for corrupted restores and failed writes.
- Restore compact boss-battle section spacing after the accessibility live region
  shifted child-position-based layout selectors.
- Keep the boss-introduction overlay dismissed during background synchronization.
- Rename the default laundry boss to match its knight-like artwork, keep fighter
  ordering stable across synchronization, and prevent accounts from acting as
  fighters linked to someone else, including before an offline cache refresh.
- Prevent stale offline configuration snapshots from overwriting newer household
  changes, isolate rejected mutations so they cannot block the offline queue,
  retain rejected changes as visible diagnostics, and serialize overlapping syncs.
- Derive reward redemption status, metadata, cost, requester, and approval data
  on the server; enforce final-state transitions and refund cancellations once.
- Enforce household role hierarchy and last-owner protection, require explicit
  governance for claimed fighters, and scope administrative session revocation
  to the affected household.
- Persist invalid child-pairing PIN attempts before returning authentication
  failures, enforce the intended database lockout, and apply route-specific
  rate limits to child login and pairing.
- Restrict synchronization responses to explicit public field projections and
  omit unused household-membership, device, and reward-configuration data.
- Make Android builds reproducible by locking Deploid, standardizing Node,
  pinning workflow actions to commit SHAs, and building releases from their tags.
- Promote scanned, digest-pinned API images from CI to production and restore the
  previously running image automatically when deployment readiness fails.
- Exclude npm and its unused global dependency tree from the production API
  image, invoking migrations and the server directly with Node.
- Keep English mode English across rewards, vouchers, transfers, shared reward
  attribution, generated boss and chore names, fighter and household fallbacks,
  level titles, and weekday labels, including synchronized redemption history.
- Surface persistent bilingual warnings when durable game storage is unavailable,
  corrupted, or full; allow failed saves to be retried and the current SQLite
  database to be downloaded for recovery.
- Add keyboard-native interactive cards, named controls and form fields, visible
  focus indicators, reduced-motion support, focus-managed dialogs, accessible
  disabled-state explanations, and live announcements for critical game feedback.
- Give debug Android builds the distinct `no.vardir.bosskamp.dev` application ID
  and “Boss Kamp Dev” launcher name so they install beside signed releases.

## [1.0.0] - 2026-08-04

### Added

- Initial signed Android release pipeline.
- Server-backed household sync with adult accounts, child PIN login, household
  device pairing, synced game configuration, and append-only gameplay events.
- Offline-first PWA gameplay with local SQLite persistence.
