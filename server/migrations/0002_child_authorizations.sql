create table if not exists child_authorizations (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references households(id) on delete cascade,
  child_user_id           uuid not null references users(id) on delete cascade,
  authorized_by_user_id   uuid not null references users(id),
  privacy_notice_version  text not null,
  authorized_at           timestamptz not null default now(),
  unique (household_id, child_user_id)
);

create index if not exists child_authorizations_household
  on child_authorizations (household_id, authorized_at);
