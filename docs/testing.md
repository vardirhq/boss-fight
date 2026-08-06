# Testing strategy

Boss Kamp uses Node's built-in test runner for focused TypeScript unit and
contract tests. CI runs the client and server suites on every pull request and
push to `main`.

## Commands

```bash
npm test
cd server && npm test
```

Run `npm run build` in both the repository root and `server/` as part of local
release validation.

## Current coverage

The client suite covers pure battle rules (HP, recurrence, schedules, status,
elite and rare behavior), progression boundaries, seed/catalog integrity,
bootstrap validation, server-state projection, sync queue recovery, avatar cache
invalidation and hash-gated transfers, revision-gated configuration reuse,
bounded event pagination and independent continuation signals, and secure
credential selection. Incremental event-cache tests cover deduplication and
independent cursor advancement. The server suite covers synchronization conflicts,
mutation processing, reward integrity, household governance, and migration
verification.

Tests use explicit local midday dates where calendar behavior matters. This
avoids midnight and UTC-offset ambiguity while still exercising the same local
calendar functions used by the application. Server-provided recurrence,
availability, and elite values are tested as authoritative overrides.

## Remaining layers

BF-006 remains in progress until the suite also includes:

- PostgreSQL integration tests for transactions, concurrency, and authorization;
- SQLite WASM persistence and fallback tests in a browser environment;
- native Android offline, process-restart, upgrade, and recovery journeys; and
- end-to-end critical user journeys with accessibility assertions.

Keep this document and the remediation tracker in
`docs/audits/2026-08-04-full-product-security-audit.md` current as those layers
land.
