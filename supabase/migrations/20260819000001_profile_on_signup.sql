-- Auto-provision a `profiles` row when a new auth user is created.
--
-- Signup only collects email + name (CONCEPT.md open question #1: magic-link
-- auth). The name has no column of its own on auth.users, so it travels as
-- `display_name` in the OTP call's `options.data` (user_metadata) and lands
-- here. `on conflict do update` makes this safe to re-run if a user retries
-- a signup (magic link re-request) after the trigger already fired once.

create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do update
    set display_name = coalesce(excluded.display_name, profiles.display_name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
