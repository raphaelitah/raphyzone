-- Dumbbell Hip Thrust is performed holding a single dumbbell across the hips,
-- so the logged weight is for one implement, not "each".
update public.exercises set implement_count = 1
where id = 'ec0ba1d0-aadc-4300-b0b8-3cc21771970b' and implement_count = 2;
