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
  "ok": true,
  "database": "boss_kamp",
  "checkedAt": "2026-08-03T17:04:57.465Z"
}
```

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

## Household Setup

### `POST /api/bootstrap`

Creates a household for the authenticated adult and makes them an active owner.
This first-household operation is retry-safe: if the same owner retries after a
lost response, the API returns their existing active owned household instead of
creating another one.

Headers:

```http
Authorization: Bearer <session.token>
```

Request:

```json
{
  "householdName": "The Household",
  "timezone": "Europe/Oslo"
}
```

Response:

```json
{
  "userId": "uuid",
  "householdId": "uuid",
  "memberId": "uuid",
  "created": true
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

Returns mutable game configuration for one household. Requires active
membership.

Response:

```json
{
  "household": {},
  "members": [],
  "fighters": [],
  "bosses": [],
  "chores": [],
  "rewards": []
}
```

## Fighters And Children

### `POST /api/households/:householdId/fighters`

Creates an unclaimed or already-linked fighter. Requires `owner` or `parent`.

Request:

```json
{
  "name": "Lina",
  "color": "#ffcc00",
  "avatarHash": "optional-content-hash",
  "requireOwnDevice": false,
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
  "requireOwnDevice": true,
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

Creates a child user, household membership, linked fighter, and PIN credential.
Requires `owner` or `parent`.

Request:

```json
{
  "displayName": "Lina",
  "pin": "1234",
  "color": "#ffcc00",
  "sort": 0
}
```

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
  "role": "member",
  "fighterId": "optional-unclaimed-fighter-uuid"
}
```

Response:

```json
{
  "invite": {
    "id": "uuid",
    "household_id": "uuid",
    "invited_email": "other-parent@example.com",
    "role": "member",
    "fighter_id": "uuid",
    "expires_at": "timestamp"
  },
  "token": "invite-token-to-send-out-of-band"
}
```

The raw invite token is returned once and only a hash is stored in the database.
Email delivery is not implemented yet.

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

`fighter` is `null` if the invite did not include a fighter or the fighter was
already claimed.

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
  "householdId": "uuid",
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

## Sync

The sync API separates mutable config from append-only events.

Mutable config is returned in full because it uses `version` and tombstones.
Append-only tables are pulled incrementally with per-table `server_seq` cursors.

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
```

Response:

```json
{
  "serverTime": "2026-08-03T17:17:20.067Z",
  "mutable": {
    "households": [],
    "household_members": [],
    "devices": [],
    "fighters": [],
    "fighter_avatars": [],
    "bosses": [],
    "chores": [],
    "rewards": []
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
      "payload": {}
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
  "id": "optional-client-generated-uuid",
  "bossId": "uuid",
  "choreId": "uuid",
  "fighterId": "uuid",
  "cycleKey": "2026-08-03",
  "resetSeq": 0,
  "choreTitle": "Optional snapshot override",
  "damage": 20,
  "performedByDeviceId": "optional-uuid",
  "actedOnBehalf": false,
  "completedAt": "2026-08-03T17:17:20Z"
}
```

The server verifies boss, chore, fighter, and device household ownership. If
`choreTitle` or `damage` are omitted, the current chore title/damage are used as
the immutable snapshot.

### Mutation: `boss_reset`

Request payload:

```json
{
  "id": "optional-client-generated-uuid",
  "bossId": "uuid",
  "cycleKey": "2026-08-03",
  "resetSeq": 1,
  "reason": "fight_again"
}
```

`reason` must be one of:

```text
fight_again, chores_edited, manual
```

### Mutation: `boss_victory`

Request payload:

```json
{
  "id": "optional-client-generated-uuid",
  "bossId": "uuid",
  "cycleKey": "2026-08-03",
  "resetSeq": 0,
  "elite": false,
  "rare": false,
  "wonAt": "2026-08-03T17:17:20Z",
  "payouts": [
    {
      "fighterId": "uuid",
      "amount": 10
    }
  ]
}
```

The unique key on `(household_id, boss_id, cycle_key, reset_seq)` makes victory
insertion idempotent. If the victory insert wins, payout rows are inserted as
`wallet_transactions.kind = 'boss_reward'` with `reference_type =
'boss_victory'`.

### Mutation: `wallet_transaction`

Request payload:

```json
{
  "id": "optional-client-generated-uuid",
  "fighterId": "uuid-or-null-for-fellespott",
  "amount": 10,
  "kind": "adjustment",
  "transferGroup": "optional-uuid",
  "referenceType": "optional-reference-type",
  "referenceId": "optional-reference-uuid",
  "note": "optional"
}
```

`kind` must be one of:

```text
boss_reward, transfer, redemption, adjustment, refund
```

For transfers, the client should send two rows with the same `transferGroup`
whose amounts sum to zero.

### Mutation: `reward_redemption`

Request payload:

```json
{
  "id": "optional-client-generated-uuid",
  "rewardId": "uuid",
  "scope": "personal",
  "fighterId": "uuid",
  "icon": "star",
  "title": "Extra screen time",
  "cost": 20,
  "status": "active",
  "approvedByUserId": "optional-uuid"
}
```

If `status` is `active`, the server inserts an idempotent negative
`wallet_transactions` row referencing the redemption.

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
- `400`: validation/database error

## Android Notes

Recommended client storage:

- Store bearer session tokens in Android encrypted storage.
- Store household-device tokens in encrypted storage on shared devices.
- Store gameplay/config locally in SQLite/Room.
- Queue offline mutations with stable UUIDs.
- Pull by per-table `serverSeq` after every successful push.
- Recompute HP, used chores, victories, coins, and XP locally from config plus
  append-only events.

The Android app must not connect directly to PostgreSQL.
