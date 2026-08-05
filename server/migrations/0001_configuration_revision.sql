alter table households
  add column if not exists configuration_revision bigint not null default 0;
