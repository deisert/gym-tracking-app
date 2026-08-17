-- One-off prototype seed. Run in the Supabase SQL editor AFTER the
-- test user exists. Idempotent.

insert into profiles (id, display_name)
select id, 'Dominik' from auth.users where email = 'gamerdomi21@googlemail.com'
on conflict (id) do nothing;

insert into exercises (user_id, name, note, attribute_options)
select u.id, e.name, e.note, e.attribute_options::jsonb
from auth.users u
cross join (values
  ('Bench Press',    null,              '{}'),
  ('Squat',          null,              '{}'),
  ('Deadlift',       null,              '{}'),
  ('Lat Pulldown',   'seat position 4', '{"grip": ["wide","narrow","neutral"]}'),
  ('Overhead Press', null,              '{}')
) as e(name, note, attribute_options)
where u.email = 'gamerdomi21@googlemail.com'
on conflict (user_id, name) do nothing;
