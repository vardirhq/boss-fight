create extension if not exists pgcrypto;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table users (
  id                uuid primary key default gen_random_uuid(),
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

create trigger users_touch_updated_at
before update on users
for each row execute function touch_updated_at();

create table password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_tokens_user
  on password_reset_tokens (user_id, created_at desc);

create table email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_verification_tokens_user
  on email_verification_tokens (user_id, created_at desc);

create table households (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  timezone             text not null default 'Europe/Oslo',
  join_code_hash       text,
  join_code_expires_at timestamptz,
  victories_baseline   integer not null default 0,
  configuration_revision bigint not null default 0,
  created_by_user_id   uuid not null references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  version              integer not null default 1
);

create trigger households_touch_updated_at
before update on households
for each row execute function touch_updated_at();

create table household_members (
  id                 uuid primary key default gen_random_uuid(),
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

create trigger household_members_touch_updated_at
before update on household_members
for each row execute function touch_updated_at();

create table devices (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid references users(id) on delete cascade,
  kind         text not null check (kind in ('personal','household')),
  name         text not null default '',
  platform     text not null default '',
  token_hash   text,
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index devices_household on devices (household_id)
  where revoked_at is null;

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  device_id    uuid references devices(id) on delete set null,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index sessions_user on sessions (user_id)
  where revoked_at is null;

create table fighters (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households(id) on delete cascade,
  user_id            uuid references users(id) on delete set null,
  name               text not null,
  color              text not null,
  avatar_hash        text,
  require_own_device boolean not null default false,
  streak             integer not null default 0,
  coins_cached       integer not null default 0,
  career_xp_cached   integer not null default 0,
  -- Pre-synchronization XP. Written once at bootstrap and never incremented, so
  -- clients can project `baseline + sum(chore_completions)` from a cached
  -- configuration without losing the history the event stream cannot replay.
  career_xp_baseline integer not null default 0,
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

create index fighters_household on fighters (household_id)
  where deleted_at is null;

create trigger fighters_touch_updated_at
before update on fighters
for each row execute function touch_updated_at();

create table fighter_avatars (
  fighter_id uuid primary key references fighters(id) on delete cascade,
  mime       text not null,
  bytes      bytea not null,
  hash       text not null,
  updated_at timestamptz not null default now()
);

create trigger fighter_avatars_touch_updated_at
before update on fighter_avatars
for each row execute function touch_updated_at();

create table household_invites (
  id                  uuid primary key default gen_random_uuid(),
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

create index household_invites_lookup on household_invites (household_id, lower(invited_email))
  where accepted_at is null;

create table device_pairings (
  id                 uuid primary key default gen_random_uuid(),
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

create index device_pairings_lookup on device_pairings (household_id, role)
  where claimed_at is null;

create table fighter_credentials (
  fighter_id      uuid primary key references fighters(id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

create trigger fighter_credentials_touch_updated_at
before update on fighter_credentials
for each row execute function touch_updated_at();

create table child_authorizations (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references households(id) on delete cascade,
  child_user_id           uuid not null references users(id) on delete cascade,
  authorized_by_user_id   uuid references users(id) on delete set null,
  privacy_notice_version  text not null,
  authorized_at           timestamptz not null default now(),
  unique (household_id, child_user_id)
);

create index child_authorizations_household
  on child_authorizations (household_id, authorized_at);

create table bosses (
  id           uuid primary key default gen_random_uuid(),
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

create index bosses_household on bosses (household_id)
  where deleted_at is null;

create trigger bosses_touch_updated_at
before update on bosses
for each row execute function touch_updated_at();

create table chores (
  id           uuid primary key default gen_random_uuid(),
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

create index chores_boss on chores (boss_id)
  where deleted_at is null;

create trigger chores_touch_updated_at
before update on chores
for each row execute function touch_updated_at();

create table rewards (
  id           uuid primary key default gen_random_uuid(),
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

create index rewards_household on rewards (household_id, scope)
  where deleted_at is null;

create trigger rewards_touch_updated_at
before update on rewards
for each row execute function touch_updated_at();

create table chore_completions (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references households(id) on delete cascade,
  boss_id                uuid not null references bosses(id) on delete restrict,
  chore_id               uuid not null references chores(id) on delete restrict,
  fighter_id             uuid not null references fighters(id) on delete restrict,
  cycle_key              text not null,
  reset_seq              integer not null default 0,
  chore_title            text not null,
  damage                 integer not null,
  performed_by_user_id   uuid references users(id),
  performed_by_device_id uuid references devices(id),
  acted_on_behalf        boolean not null default false,
  completed_at           timestamptz not null,
  voided_at              timestamptz,
  voided_by_user_id      uuid references users(id),
  created_at             timestamptz not null default now(),
  server_seq             bigserial not null
);

create index cc_cycle on chore_completions (household_id, boss_id, cycle_key)
  where voided_at is null;
create index cc_sync on chore_completions (household_id, server_seq);
create index cc_xp on chore_completions (household_id, fighter_id)
  where voided_at is null;

create table boss_resets (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households(id) on delete cascade,
  boss_id            uuid not null references bosses(id) on delete restrict,
  cycle_key          text not null,
  reset_seq          integer not null,
  reason             text not null check (reason in ('fight_again','chores_edited','manual')),
  created_by_user_id uuid references users(id),
  created_at         timestamptz not null default now(),
  server_seq         bigserial not null,
  unique (household_id, boss_id, cycle_key, reset_seq)
);

create index boss_resets_sync on boss_resets (household_id, server_seq);

create table boss_victories (
  id           uuid primary key default gen_random_uuid(),
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

create index boss_victories_sync on boss_victories (household_id, server_seq);

create table wallet_transactions (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households(id) on delete cascade,
  fighter_id         uuid references fighters(id) on delete restrict,
  amount             integer not null,
  kind               text not null
                       check (kind in ('boss_reward','transfer','redemption','adjustment','refund')),
  transfer_group     uuid,
  reference_type     text,
  reference_id       uuid,
  note               text,
  created_by_user_id uuid references users(id),
  created_at         timestamptz not null default now(),
  server_seq         bigserial not null
);

create unique index wt_idempotent on wallet_transactions (
  household_id,
  coalesce(fighter_id, '00000000-0000-0000-0000-000000000000'::uuid),
  reference_type,
  reference_id
) where reference_type is not null;

create index wt_balance on wallet_transactions (household_id, fighter_id);
create index wt_sync on wallet_transactions (household_id, server_seq);

create table reward_redemptions (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references households(id) on delete cascade,
  reward_id            uuid references rewards(id) on delete set null,
  scope                text not null check (scope in ('personal','group')),
  fighter_id           uuid references fighters(id) on delete restrict,
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

create index reward_redemptions_household on reward_redemptions (household_id, status);
create index reward_redemptions_sync on reward_redemptions (household_id, server_seq);

create trigger reward_redemptions_touch_updated_at
before update on reward_redemptions
for each row execute function touch_updated_at();

create or replace function bump_reward_redemption_server_seq()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.server_seq = nextval(pg_get_serial_sequence('reward_redemptions', 'server_seq'));
  end if;
  return new;
end;
$$;

create trigger reward_redemptions_bump_server_seq
before update on reward_redemptions
for each row execute function bump_reward_redemption_server_seq();
