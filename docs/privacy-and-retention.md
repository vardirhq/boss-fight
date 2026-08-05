# Privacy And Data Lifecycle

The public, bilingual notice is published at `/privacy.html`. Its current version
is `2026-08-05`, matching `PRIVACY_NOTICE_VERSION` in `server/src/privacy.ts`.
Changing the substance of the notice requires a new version and must not rewrite
existing child-authorization records.

## Implemented Controls

- Child accounts contain no email address or password.
- Creating a child login requires an adult parent/guardian acknowledgement.
- The server records the household, child, authorizing adult, notice version,
  and authorization time.
- Owners and parents can export household configuration and full gameplay history
  as JSON from Account & Household.
- Export projections exclude password, PIN, session, device, pairing, and join-code
  hashes.
- Parents can suspend child access and revoke household-scoped sessions/devices.
- Owners and parents can permanently erase a child identity, credentials,
  devices, avatar, authorization record, and identifying actor links. Gameplay
  and economy rows remain attached only to a deleted generic fighter tombstone.

## Current Retention

Synchronized configuration and gameplay history are currently retained while the
household uses the service, or until a manual deletion request is completed.
Expired invitations, pairings, sessions, and revoked devices are not yet removed
by an automated retention job. Database backups follow the operational backup
procedures, but a tested backup-expiry and erasure runbook remains outstanding.

## Remaining Work

- Obtain qualified review of lawful basis, notice language, processors, and
  hosting disclosures.
- Add self-service adult-account and household erasure, plus real-database tests
  that verify child erasure across primary storage.
- Implement and enforce retention windows for invitations, pairings, sessions,
  devices, avatars, activity events, and backups.
- Document processor agreements, storage locations, deletion SLAs, and restoration
  behavior after an erasure request.
