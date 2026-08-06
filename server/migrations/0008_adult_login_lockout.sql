-- Child PINs have carried a failed-attempt counter and lockout since the pairing work.
-- Adult passwords, which unlock household administration and every erasure flow, had
-- neither: a per-IP limit alone is defeated by spreading guesses across addresses.
alter table users
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists login_locked_until timestamptz;
