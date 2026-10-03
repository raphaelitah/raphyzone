-- The free tier's workout sample. Chosen to show the range of the library:
-- classic strength splits, Hyrox/hero/benchmark-style conditioning, and one or
-- two of each interval format (Tabata, EMOM, AMRAP), plus a mobility session.
-- Everything else stays locked (blurred in the library) until the user is premium.
update public.workouts set is_free = false
where owner_id is null and ownership_type = 'official';

update public.workouts set is_free = true
where owner_id is null
  and ownership_type = 'official'
  and name in (
    -- standard strength
    'leg day', 'Push (Chest + Triceps)', 'Pull (Back + Biceps)',
    -- advanced / event style
    'Hyrox w/o equipment - 45min Time Cap', 'Bert', '12 Days of Christmas', 'Murph',
    -- Tabata
    'Fight Gone Bad', 'Salazar',
    -- EMOM
    'Chelsea', 'Macho Man',
    -- AMRAP
    'Cindy', 'Jack',
    -- mobility
    'Mobility Flow'
  );

do $$
declare n int;
begin
  select count(*) into n from public.workouts where is_free and owner_id is null and ownership_type = 'official';
  if n <> 14 then
    raise exception 'expected 14 free sample workouts, flagged %', n;
  end if;
end $$;
