alter table child_authorizations
  alter column authorized_by_user_id drop not null;

alter table child_authorizations
  drop constraint if exists child_authorizations_authorized_by_user_id_fkey;

alter table child_authorizations
  add constraint child_authorizations_authorized_by_user_id_fkey
  foreign key (authorized_by_user_id) references users(id) on delete set null;
