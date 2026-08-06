-- Lifetime career XP is projected on the client as `baseline + sum(chore_completions)`.
-- `career_xp_cached` cannot serve as that baseline: it grows with every completion, and
-- the sync pull omits fighter rows entirely while the configuration revision is unchanged,
-- so clients read a stale value. The baseline is written once at bootstrap and never
-- incremented, which makes it safe to cache alongside the rest of the configuration.
alter table fighters
  add column if not exists career_xp_baseline integer not null default 0;

-- Existing households: recover the pre-synchronization XP that the event stream cannot
-- replay. Anything the completion history already accounts for must not be counted twice.
update fighters f
set career_xp_baseline = greatest(
  0,
  f.career_xp_cached - coalesce((
    select sum(cc.damage)::integer
    from chore_completions cc
    where cc.fighter_id = f.id and cc.voided_at is null
  ), 0)
)
where f.career_xp_baseline = 0;
