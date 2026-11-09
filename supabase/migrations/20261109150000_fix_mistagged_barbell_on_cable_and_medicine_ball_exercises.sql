-- Three exercises carry a 'Barbell' equipment tag although they are done with
-- something else, so an athlete without a barbell was never offered them:
--   EX00471 Cable Romanian Deadlift  [Barbell, Cable]     -> [Cable]
--   EX01510 Medicine Ball Clean      [Barbell, Slam Ball] -> [Slam Ball]
--   EX01508 MedBall Cleans           [Barbell]            -> [Slam Ball]
--
-- MedBall Cleans cannot just lose 'Barbell': an empty list reads as "needs no
-- equipment" to the plan matcher and would offer it to everyone. It gets
-- 'Slam Ball', the tag its sibling Medicine Ball Clean uses for the medicine
-- ball. Guarded on the current tags so a row someone has already corrected is
-- left alone.
update public.exercises
set equipment_tags = equipment_tags - 'Barbell'
where exercise_code in ('EX00471', 'EX01510')
  and equipment_tags ? 'Barbell';

update public.exercises
set equipment_tags = '["Slam Ball"]'::jsonb
where exercise_code = 'EX01508'
  and equipment_tags = '["Barbell"]'::jsonb;
