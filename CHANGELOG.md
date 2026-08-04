# Changelog

All notable production changes should be documented here.

This project uses semver-style version names for app releases and monotonically
increasing Android version codes for install/update compatibility.

## [Unreleased]

### Added

- Automated release preparation that updates application and Android versions,
  rolls changelog entries into a dated release, opens a release pull request,
  and starts the signed Android build after merge.
- Focused client and server synchronization tests, including CI coverage for
  queue recovery, configuration conflicts, and reward-redemption rules.
- An audit remediation tracker linking each finding to its current status and
  merged implementation evidence.

### Fixed

- Keep the boss-introduction overlay dismissed during background synchronization.
- Rename the default laundry boss to match its knight-like artwork, keep fighter
  ordering stable across synchronization, and prevent accounts from acting as
  fighters linked to someone else, including before an offline cache refresh.
- Prevent stale offline configuration snapshots from overwriting newer household
  changes, isolate rejected mutations so they cannot block the offline queue,
  retain rejected changes as visible diagnostics, and serialize overlapping syncs.
- Derive reward redemption status, metadata, cost, requester, and approval data
  on the server; enforce final-state transitions and refund cancellations once.

## [1.0.0] - 2026-08-04

### Added

- Initial signed Android release pipeline.
- Server-backed household sync with adult accounts, child PIN login, household
  device pairing, synced game configuration, and append-only gameplay events.
- Offline-first PWA gameplay with local SQLite persistence.
