# Privacy And Data Lifecycle

The public, bilingual notice is published at `/privacy.html`. Its current version
is `2026-08-05.4`, matching `PRIVACY_NOTICE_VERSION` in `server/src/privacy.ts`.
Changing the substance of the notice requires a new version and must not rewrite
existing child-authorization records.

The API temporarily accepts the preceding `2026-08-05`, `2026-08-05.2`, and
`2026-08-05.3` versions so installed APKs continue to create authorized child
logins while new clients roll out. Each authorization stores the exact
client-submitted version; new clients submit `2026-08-05.4`.

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
- Owners can permanently erase an entire household after re-entering their
  password and the exact household name. All household-owned configuration,
  child identities, devices, activity, wallet, and reward data is deleted;
  independent adult accounts remain.
- Adults can permanently erase their own account after re-entering their password
  and email address, provided every household they own has another active owner.
  Credentials, devices, memberships, and identifying fighter/actor links are
  removed; historical child authorizations retain only non-identifying evidence.

## Current Retention

Synchronized configuration and gameplay history are currently retained while the
household uses the service, or until a manual deletion request is completed.
The API runs retention cleanup at startup and every 24 hours:

- expired or accepted invitations: 30 days;
- expired or claimed device pairings: 7 days;
- expired or revoked sessions: 30 days;
- used or expired password-reset records: 30 days;
- revoked devices: 30 days, after detaching retained activity references;
- avatars belonging to deleted fighters: 30 days.

These windows can be shortened or extended with the documented server environment
variables. Active devices, active configuration, gameplay/economy history, and
avatars for active fighters are not age-deleted. Database backups follow the
operational backup procedures, but a tested backup-expiry and erasure runbook
remains outstanding.

## Remaining Work

- Obtain qualified review of lawful basis, notice language, processors, and
  hosting disclosures.
- Define and enforce lifecycle rules for active configuration, activity events,
  and backups.
- Document processor agreements, storage locations, deletion SLAs, and restoration
  behavior after an erasure request.
