# Boss Kamp API

Production base URL:

```text
https://boss-kamp.vardir.no
```

All request and response bodies are JSON unless noted otherwise.

## Authentication

Adult and child users authenticate with bearer sessions:

```http
Authorization: Bearer <session.token>
```

Sessions have both an absolute expiry and an inactivity expiry. The production
defaults are 90 days total and 30 days since the last authenticated request.

Household devices authenticate on sync routes with:

```http
x-boss-kamp-device-token: <deviceToken>
```

Do not put database credentials or server secrets in the Android app. The app
only stores session tokens or household-device tokens issued by this API.

## Health

### `GET /health`

Public health check.

Response:

```json
{
  "ok": true
}
```

The public response intentionally omits database and service internals.

Each mutation is committed independently. The response has a `results` entry for
every submitted mutation with an `outcome` of `accepted`, `duplicate`, `conflict`,
or `rejected`. A rejected item never rolls back or blocks later items. `accepted`
is retained as a compatibility view containing successful results only.
Result `id` identifies the submitted mutation; when the affected resource has a
different identifier it is returned as `resourceId`.

## Auth

### `POST /api/auth/register`

Creates an adult account and returns a session.

Request:

```json
{
  "email": "parent@example.com",
  "displayName": "Parent",
  "password": "at-least-10-chars"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "parent@example.com",
    "display_name": "Parent"
  },
  "session": {
    "token": "opaque-token",
    "sessionId": "uuid",
    "expiresAt": "2026-11-01T17:04:46.391Z"
  }
}
```

### `POST /api/auth/login`

Logs an adult in by email/password.

Request:

```json
{
  "email": "parent@example.com",
  "password": "at-least-10-chars"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "parent@example.com",
    "displayName": "Parent"
  },
  "session": {
    "token": "opaque-token",
    "sessionId": "uuid",
    "expiresAt": "2026-11-01T17:04:46.391Z"
  }
}
```

### `POST /api/auth/password-reset/request`

Accepts an adult email address and always returns `{ "accepted": true }`, whether
or not the account exists. For an existing account, the server emails a
single-use reset token that expires after 30 minutes. Requests are rate-limited.

### `POST /api/auth/password-reset/confirm`

Accepts the emailed `token` and a new `password` of at least ten characters.
Successful use changes the password, consumes the token, and revokes every
existing session for the account.

### `POST /api/auth/email-verification/resend`

Authenticated adults can request a new 24-hour, single-use email verification
code. Requests are rate-limited.

### `POST /api/auth/email-verification/confirm`

Consumes an emailed verification `token` and records the account's verified
timestamp. Existing accounts at migration time are preserved as verified;
new registrations begin unverified.

### `POST /api/auth/child-login`

Logs a child in using a claimed fighter and PIN. This also creates a personal
device row for the child.

Request:

```json
{
  "householdId": "uuid",
  "fighterId": "uuid",
  "pin": "1234",
  "deviceName": "Lina's phone",
  "platform": "android"
}
```

### `POST /api/auth/child-pair`

Claims a short-lived fighter pairing code and verifies the child's PIN. The
client does not need to know a household or fighter UUID.

```json
{
  "code": "AB12CD34",
  "pin": "1234",
  "deviceName": "Lina's phone",
  "platform": "android"
}
```

Returns the child user, linked fighter and personal device IDs, and a bearer
session.

Response:

```json
{
  "user": {
    "id": "uuid",
    "kind": "child",
    "displayName": "Lina"
  },
  "fighterId": "uuid",
  "deviceId": "uuid",
  "session": {
    "token": "opaque-token",
    "sessionId": "uuid",
    "expiresAt": "2026-11-01T17:04:46.391Z"
  }
}
```

### `POST /api/auth/logout`

Revokes the current bearer session.

Headers:

```http
Authorization: Bearer <session.token>
```

Response:

```json
{ "ok": true }
```

### `GET /api/me/sessions`

Lists the authenticated user's active, unexpired sessions. Each item includes
its creation, last-use and expiry timestamps, optional device name/platform,
and whether it is the session making the request. Tokens and token hashes are
never returned.

### `DELETE /api/me/sessions/:sessionId`

Revokes one session owned by the authenticated user. Revoking the current
session immediately invalidates its bearer token.

### `GET /api/me`

Returns the authenticated user and active household memberships.

Headers:

```http
Authorization: Bearer <session.token>
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "kind": "adult",
    "email": "parent@example.com",
    "display_name": "Parent",
    "email_verified_at": null,
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  "households": [
    {
      "id": "uuid",
      "name": "The Household",
      "timezone": "Europe/Oslo",
      "role": "owner",
      "status": "active"
    }
  ]
}
```

### `DELETE /api/me`

Permanently erases the authenticated adult account, including email, display
name, password, sessions, devices, memberships, and identifying fighter/actor
links. Requires the current password and an exact case-insensitive email
confirmation.

```json
{
  "password": "current adult password",
  "confirmedEmail": "parent@example.com"
}
```

Deletion is blocked if the adult is the last active owner of any household. They
must first transfer ownership to another active owner or erase that household.
Linked fighters become deleted generic tombstones so other households retain
referential and accounting integrity. Historical child-authorization rows retain
their notice version and timestamp but no longer identify the erased adult.

## Household Setup

### `POST /api/bootstrap`

Creates (or reuses) the authenticated adult's household and atomically installs
the app's complete game configuration. The operation is retry-safe: each stable
`clientId` is deterministically mapped to a household-scoped UUID, so retries
upsert the same rows and return the same ID mappings after a lost response.

Headers:

```http
Authorization: Bearer <session.token>
```

Request:

```json
{
  "householdName": "The Household",
  "timezone": "Europe/Oslo",
  "ownerFighterClientId": "f1",
  "victoriesBaseline": 4,
  "pool": 12,
  "fighters": [
    {
      "clientId": "f1",
      "name": "Alma",
      "color": "#E0564A",
      "streak": 2,
      "coins": 8,
      "careerXp": 75,
      "sort": 0
    }
  ],
  "bosses": [
    {
      "clientId": "b1",
      "name": "Laundry Dragon",
      "sprite": "dragon",
      "frames": 0,
      "rare": false,
      "trigger": { "type": "daglig" },
      "dormant": false,
      "unlockAt": 0,
      "sort": 0
    }
  ],
  "chores": [
    {
      "clientId": "c1",
      "bossClientId": "b1",
      "title": "Fold clothes",
      "damage": 20,
      "repeatable": false,
      "sort": 0
    }
  ],
  "rewards": []
}
```

`ownerFighterClientId` must reference one submitted fighter. That fighter is
linked to the authenticated owner in the same transaction; all other submitted
fighters remain unclaimed profiles for people who play through a parent or
shared household device.

Fighters may include an `avatar` object with `mime`, base64 `bytesBase64`, and
its SHA-256 `hash`. All nested rows are committed in one database transaction;
an invalid relationship or avatar rolls back the entire request.

Response:

```json
{
  "userId": "uuid",
  "householdId": "uuid",
  "memberId": "uuid",
  "created": true,
  "ids": {
    "fighters": { "f1": "uuid" },
    "bosses": { "b1": "uuid" },
    "chores": { "c1": "uuid" },
    "rewards": {}
  }
}
```

`created` is `false` when an earlier successful bootstrap is returned.

### `PATCH /api/households/:householdId`

Updates household metadata. Requires `owner` or `parent`.

Request:

```json
{
  "name": "New Household Name",
  "timezone": "Europe/Oslo"
}
```

Response:

```json
{ "household": { "id": "uuid", "name": "New Household Name" } }
```

### `GET /api/households/:householdId/config`

Returns the authoritative game configuration for one household, including
avatars and derived wallet balances. Requires active membership.

Response:

```json
{
  "household": {},
  "members": [],
  "fighters": [],
  "fighterAvatars": [],
  "bosses": [],
  "chores": [],
  "rewards": [],
  "balances": []
}
```

## Fighters And Children

### `GET /api/households/:householdId/export`

Downloads a versioned JSON export of the household configuration, members,
devices, child-authorization records, avatars, invitations, pairings, and complete
gameplay/economy history. Requires `owner` or `parent`.

The response is projected through explicit allowlists. Password hashes, PIN
hashes, device/session tokens, pairing-code hashes, and household join-code
hashes are never included.

```json
{
  "format": "boss-kamp-household-export",
  "formatVersion": 1,
  "exportedAt": "2026-08-05T12:00:00.000Z",
  "privacyNoticeVersion": "2026-08-05",
  "data": {
    "household": {},
    "members": [],
    "childAuthorizations": [],
    "fighters": [],
    "choreCompletions": [],
    "walletTransactions": []
  }
}
```

### `DELETE /api/households/:householdId`

Permanently erases the household and every household-owned child identity,
fighter, avatar, device, invitation, pairing, configuration row, gameplay event,
wallet transaction, and reward redemption. Adult user accounts remain and may
create or join another household. Requires `owner`, the owner's current password,
and an exact case-sensitive household-name confirmation.

```json
{
  "password": "current adult password",
  "confirmedName": "Exact Family Name"
}
```

Sessions attached to household devices are revoked before the household cascade.
Child user rows are removed after their household-owned records have been deleted.

### `POST /api/households/:householdId/fighters`

Creates an unclaimed or already-linked fighter. Requires `owner` or `parent`.

Request:

```json
{
  "name": "Lina",
  "color": "#ffcc00",
  "avatarHash": "optional-content-hash",
  "sort": 0
}
```

Response:

```json
{ "fighter": { "id": "uuid", "name": "Lina" } }
```

### `PATCH /api/households/:householdId/fighters/:fighterId`

Updates fighter metadata. Requires `owner` or `parent`.

Request fields are optional:

```json
{
  "name": "Lina",
  "color": "#ffcc00",
  "avatarHash": "content-hash",
  "sort": 1
}
```

### `DELETE /api/households/:householdId/fighters/:fighterId`

Soft-deletes a fighter. Requires `owner` or `parent`.

Response:

```json
{ "ok": true }
```

### `POST /api/households/:householdId/children`

Claims an existing unclaimed fighter by creating a child user, household
membership, and PIN credential. It never creates a duplicate fighter. Requires
`owner` or `parent`. The application requires the adult to acknowledge the
published privacy notice, and the server records the authorizing adult, child,
household, notice version, and timestamp.

Request:

```json
{
  "fighterId": "existing-fighter-uuid",
  "pin": "1234",
  "authorized": true,
  "privacyNoticeVersion": "2026-08-05"
}
```

### Fighter account controls

These routes require `owner` or `parent` and preserve the fighter's game
history:

- `POST /api/households/:householdId/fighters/:fighterId/pin` resets a child PIN.
- `POST /api/households/:householdId/fighters/:fighterId/suspend` suspends or
  restores the linked member; suspension revokes their sessions and devices.
- `POST /api/households/:householdId/fighters/:fighterId/unlink` removes the
  identity link and unlocks the fighter without deleting its history.
- `DELETE /api/households/:householdId/children/:fighterId` permanently erases a
  child identity, authorization record, PIN, sessions, devices, pairings, avatar,
  and identifying actor links. It replaces the fighter with a deleted generic
  tombstone so de-identified gameplay and wallet records retain referential and
  accounting integrity. This route rejects adult and unclaimed fighters.

Household governance follows a strict hierarchy: owners may administer another
member, while parents may administer only members and children. Callers cannot
administer their own membership, and suspension or unlinking can never leave a
household without an active owner. Claimed fighters cannot be deleted directly
or omitted from a full configuration replacement; they must be unlinked through
the explicit governance route first.

Suspension and unlinking revoke only sessions attached to devices in the target
household. Unscoped adult login sessions remain valid for other households, but
the changed membership immediately prevents access to this household.

Response:

```json
{
  "user": {
    "id": "uuid",
    "kind": "child",
    "display_name": "Lina"
  },
  "memberId": "uuid",
  "fighter": {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Lina"
  }
}
```

## Bosses

### `POST /api/households/:householdId/bosses`

Creates a boss. Requires `owner` or `parent`.

Request:

```json
{
  "name": "Vaskedragen",
  "sprite": "laundry-dragon.png",
  "frames": 4,
  "rare": false,
  "hue": 120,
  "triggerType": "daglig",
  "triggerDay": 1,
  "triggerDate": 15,
  "triggerNote": "after school",
  "dormant": false,
  "unlockAt": 0,
  "sort": 0
}
```

`triggerType` must be one of:

```text
alltid, daglig, ukentlig, månedlig, sjelden
```

### `PATCH /api/households/:householdId/bosses/:bossId`

Updates a boss. Same fields as create, all optional.

### `DELETE /api/households/:householdId/bosses/:bossId`

Soft-deletes a boss.

Response:

```json
{ "ok": true }
```

## Chores

### `POST /api/households/:householdId/chores`

Creates a chore for a boss. Requires `owner` or `parent`.

Request:

```json
{
  "bossId": "uuid",
  "title": "Tøm oppvaskmaskin",
  "damage": 20,
  "repeatable": false,
  "sort": 0
}
```

The server verifies that `bossId` belongs to the same household.

### `PATCH /api/households/:householdId/chores/:choreId`

Updates a chore. Request fields are optional:

```json
{
  "bossId": "uuid",
  "title": "Tøm oppvaskmaskin",
  "damage": 20,
  "repeatable": false,
  "sort": 0
}
```

### `DELETE /api/households/:householdId/chores/:choreId`

Soft-deletes a chore.

Response:

```json
{ "ok": true }
```

## Rewards

### `POST /api/households/:householdId/rewards`

Creates a reward. Requires `owner` or `parent`.

Request:

```json
{
  "scope": "personal",
  "icon": "star",
  "title": "Extra screen time",
  "descr": "30 minutes",
  "cost": 20,
  "sort": 0
}
```

`scope` must be `personal` or `group`.

### `PATCH /api/households/:householdId/rewards/:rewardId`

Updates a reward. Same fields as create, all optional.

### `DELETE /api/households/:householdId/rewards/:rewardId`

Soft-deletes a reward.

Response:

```json
{ "ok": true }
```

## Adult Invites

### `POST /api/households/:householdId/invites`

Creates an adult invite. Requires `owner` or `parent`.

Request:

```json
{
  "email": "other-parent@example.com",
  "role": "parent",
  "fighterId": null
}
```

Response:

```json
{
  "invite": {
    "id": "uuid",
    "household_id": "uuid",
    "invited_email": "other-parent@example.com",
    "role": "parent",
    "fighter_id": null,
    "expires_at": "timestamp"
  },
  "delivered": true
}
```

The API sends the raw invitation token to the invited address through the
configured SMTP service. It stores only the token hash and does not return the
raw token to the client. Delivery uses `Boss Kamp <chris@vardir.no>` by default,
can be overridden with `SMTP_FROM`, and must be accepted by SMTP before this
endpoint succeeds. Invitations expire after seven days. A failed delivery
returns `502` with code `mail_delivery_failed` and expires the unusable invite.
Invite cleanup is best-effort and never masks the SMTP delivery result.

### `POST /api/invites/accept`

Accepts an invite for the currently authenticated adult. The account email must
match the invite email.

Request:

```json
{
  "token": "invite-token"
}
```

Response:

```json
{
  "member": {
    "id": "uuid",
    "household_id": "uuid",
    "user_id": "uuid",
    "role": "member",
    "status": "active"
  },
  "fighter": {
    "id": "uuid",
    "user_id": "uuid"
  }
}
```

When an adult accepts an invitation without `fighterId`, the server creates and
links a fighter from that adult's account name. An invitation with `fighterId`
claims that existing fighter instead. This keeps account-backed adults automatic
while preserving explicit fighter claiming for an existing profile.

## Household Device Pairing

### `POST /api/households/:householdId/pairings`

Creates a short-lived pairing code. Requires `owner` or `parent`.

Request:

```json
{
  "role": "household_device",
  "fighterId": null
}
```

Response:

```json
{
  "pairing": {
    "id": "uuid",
    "household_id": "uuid",
    "role": "household_device",
    "expires_at": "timestamp"
  },
  "code": "AB12CD34"
}
```

The raw code is returned once and only a hash is stored in the database.

### `POST /api/pairings/claim-household-device`

Claims a household-device pairing code and returns a long-lived device token.

Request:

```json
{
  "code": "AB12CD34",
  "name": "Kitchen tablet",
  "platform": "android"
}
```

Response:

```json
{
  "device": {
    "id": "uuid",
    "household_id": "uuid",
    "kind": "household",
    "name": "Kitchen tablet",
    "platform": "android"
  },
  "deviceToken": "opaque-device-token"
}
```

The response also includes `householdId`, allowing a fresh shared device to
restore the correct household without already knowing its UUID.

## Sync

The sync API separates mutable config from append-only events. Responses use
explicit public projections: database credentials, actor/audit identifiers,
revocation metadata, and other implementation-only columns are never part of
the client contract. Mutable rows include only fields needed to rebuild game
state, including deletion tombstones. Event rows retain `server_seq` for
incremental cursors.

### `GET /api/sync/pull`

Requires either bearer auth for a household member or a household-device token.

Query parameters:

```text
household_id=uuid
since_chore_completions=0
since_boss_resets=0
since_boss_victories=0
since_wallet_transactions=0
since_reward_redemptions=0
known_avatar_hashes={"fighter-uuid":"sha256-hex"}
known_configuration_revision=12
event_limit=250
```

Clients persist the greatest `server_seq` received for each event stream and
send those values on later pulls. Responses contain only rows after the supplied
cursors. Reward-redemption status transitions receive a fresh sequence, so
their updated row is delivered incrementally and replaces the cached version.
Clients also send the hashes of locally cached fighter avatars. Fighter rows
include `avatar_hash`; matching avatar bytes are omitted from the response, and
clients retain cached bytes only when that hash still matches. A changed hash
returns the replacement payload, while a missing hash removes the cached avatar.
When `known_configuration_revision` matches the current household revision, the
response sets `configurationUnchanged` to `true` and returns empty mutable
collections. Clients must reuse a complete cache for that exact revision; clients
without one omit the parameter and receive the full mutable configuration.
Each event stream is independently limited to 250 rows by default. `event_limit`
may select 1–500 rows. The response's `eventHasMore` map identifies streams with
another page; clients advance only those streams' durable `server_seq` cursors
and continue until all values are false.

Response:

```json
{
  "serverTime": "2026-08-03T17:17:20.067Z",
  "configurationRevision": 12,
  "configurationUnchanged": false,
  "eventHasMore": {
    "chore_completions": false,
    "boss_resets": false,
    "boss_victories": false,
    "wallet_transactions": false,
    "reward_redemptions": false
  },
  "mutable": {
    "households": [],
    "fighters": [],
    "fighter_avatars": [],
    "bosses": [],
    "chores": []
  },
  "events": {
    "chore_completions": [],
    "boss_resets": [],
    "boss_victories": [],
    "wallet_transactions": [],
    "reward_redemptions": []
  }
}
```

The authoritative field allowlists live in `server/src/syncProjection.ts` and
are enforced again at the response boundary. Household membership, device, and
reward-configuration collections are omitted because the game-state projection
does not consume them.

### `POST /api/sync/push`

Pushes append-only mutations. Requires either bearer auth for a household member
or a household-device token.

Request:

```json
{
  "householdId": "uuid",
  "mutations": [
    {
      "type": "chore_completion",
      "payload": { "id": "stable-client-generated-uuid" }
    }
  ]
}
```

Response:

```json
{
  "accepted": [
    {
      "type": "chore_completion",
      "id": "uuid",
      "serverSeq": "1"
    }
  ]
}
```

### Mutation: `chore_completion`

Request payload:

```json
{
  "id": "stable-client-generated-uuid",
  "bossId": "uuid",
  "choreId": "uuid",
  "fighterId": "uuid",
  "cycleKey": "2026-08-03",
  "resetSeq": 0,
  "completedAt": "2026-08-03T17:17:20Z"
}
```

The server verifies household ownership, fighter authority, current cycle,
availability, reset sequence, and repeatability. It snapshots title and damage
from the server configuration and derives performer/device and
`acted_on_behalf`; client-supplied authority or reward values are not trusted.
When this completion is the final blow, victory insertion and elite-aware wallet
payouts happen atomically and exactly once.

### Mutation: `boss_reset`

Request payload:

```json
{
  "id": "stable-client-generated-uuid",
  "bossId": "uuid",
  "fighterId": "uuid",
  "cycleKey": "2026-08-03",
  "resetSeq": 1,
  "reason": "fight_again"
}
```

`reason` must be one of:

```text
fight_again, chores_edited, manual
```

### Mutation: `wallet_transfer`

Request payload:

```json
{
  "id": "stable-client-generated-uuid",
  "fighterId": "uuid",
  "amount": 10,
  "transferGroup": "stable-client-generated-uuid"
}
```

The server validates authority and the derived fighter balance, then inserts the
fighter debit and shared-pool credit in one transaction. Clients cannot submit
arbitrary wallet ledger rows.

### Mutation: `configuration_replace`

An owner/parent may atomically replace the submitted fighter, boss, chore, and
reward configuration using the same deterministic ID mapping as bootstrap. Rows absent
from the snapshot are soft-deleted. The response includes fresh client-to-server
ID mappings. Chore changes advance the affected boss reset sequence so old
completion events cannot corrupt the edited fight.

The payload must include `expectedRevision`, copied from the most recent pull.
The server locks the household and rejects a stale snapshot with outcome
`conflict` and code `configuration_revision_conflict`; a successful replacement
increments and returns `configurationRevision`. Clients pull authoritative state
after every push, quarantine permanent failures for diagnostics, and continue
sending later mutations.

### Mutation: `reward_redemption`

Request payload:

```json
{
  "id": "stable-client-generated-uuid",
  "rewardId": "uuid",
  "fighterId": "uuid"
}
```

The server resolves the reward configuration and derives scope, title, icon,
cost, initial `active` status, requester, and approval identity. It verifies
fighter authority and the derived balance, then inserts the redemption and debit
atomically. Client-supplied display, cost, status, scope, requester, and approver
fields are ignored. A retry with the same ID cannot charge twice.

### Mutation: `reward_redemption_update`

An owner/parent may transition an `active` redemption to `used` or `cancelled`.
Authorization is checked server-side, cancellation refunds the original
server-snapshotted cost exactly once, and repeated transitions to the same state
are idempotent. Final states cannot transition to one another.

## Error Responses

Common errors:

```json
{ "error": "Unauthorized" }
```

```json
{ "error": "Forbidden" }
```

```json
{ "error": "fieldName is required" }
```

HTTP status mapping:

- `401`: missing or invalid session/device token
- `403`: authenticated but not an active member or lacks role
- `400`: malformed or invalid request
- `409`: unique/version conflict
- `422`: domain rule violation
- `429`: rate limited
- `500`: unexpected server failure

## Android Notes

Client storage contract:

- The packaged Android app stores bearer sessions and household-device tokens
  through `@aparajita/capacitor-secure-storage`, using AES-GCM and an Android
  Keystore-generated key. Native tokens must never be copied back to WebView
  `localStorage`.
- Existing Android installations migrate legacy browser-stored tokens into the
  secure store on first launch after upgrade, then scrub the browser record.
- The browser development fallback keeps credentials in origin-scoped web storage because native
  platform storage is unavailable there; the application CSP limits executable
  and connect origins.
- Store gameplay/config locally in SQLite/Room.
- Queue offline mutations with stable UUIDs.
- Pull by per-table `serverSeq` after every successful push.
- Recompute HP, used chores, victories, coins, and XP locally from config plus
  append-only events.

The Android app must not connect directly to PostgreSQL.
