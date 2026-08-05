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

drop trigger if exists reward_redemptions_bump_server_seq on reward_redemptions;
create trigger reward_redemptions_bump_server_seq
before update on reward_redemptions
for each row execute function bump_reward_redemption_server_seq();
