-- Remove the stray 'Barbell' equipment tag from dumbbell and kettlebell exercises.
--
-- 128 exercises whose name says Dumbbell, Kettlebell or KB (and not Barbell) also
-- carry a 'Barbell' tag in equipment_tags, e.g. "Dumbbell Clean + Press" is
-- [Barbell, Dumbbells]. The plan matcher requires every tag, so an athlete who
-- owns dumbbells or a kettlebell but no barbell was never offered them, and the
-- dumbbell/kettlebell substitution (20261109130000) could not help with any of the
-- clean, snatch and front-rack pairs.
--
-- Only 'Barbell' is removed: other tags (Pull-up Bar, Step Box, ...) are kept, and
-- exercises whose name does not say dumbbell/kettlebell/KB are not touched
-- (including the ones that really are barbell lifts).
--
-- The legacy free-text `equipment` column is left as is.
--
-- Not reversible by query once applied (the rows no longer differ from others),
-- so these are the 128 affected exercise_codes at the time of writing. To undo:
--   update public.exercises set equipment_tags = equipment_tags || '["Barbell"]'::jsonb
--   where exercise_code in (<codes below>);
--   EX00070, EX00074, EX00098, EX00555, EX00557, EX00575, EX00576, EX00578, EX00579, EX00650
--   EX00682, EX00683, EX00684, EX00685, EX00688, EX00694, EX00696, EX00699, EX00700, EX00702
--   EX00703, EX00705, EX00735, EX00736, EX00759, EX00760, EX00761, EX00762, EX00763, EX00764
--   EX00765, EX00774, EX00775, EX00776, EX00777, EX00778, EX00779, EX00790, EX00791, EX00796
--   EX00797, EX00798, EX00807, EX00823, EX00825, EX00826, EX00827, EX00828, EX00829, EX00835
--   EX00840, EX00883, EX00919, EX00921, EX00930, EX00995, EX01024, EX01028, EX01029, EX01030
--   EX01031, EX01032, EX01114, EX01309, EX01311, EX01314, EX01315, EX01316, EX01317, EX01334
--   EX01335, EX01336, EX01337, EX01344, EX01345, EX01346, EX01360, EX01361, EX01362, EX01368
--   EX01372, EX01607, EX01610, EX01681, EX01799, EX01831, EX01834, EX02032, EX02092, EX02130
--   EX02132, EX02133, EX02135, EX02136, EX02142, EX02146, EX02149, EX02150, EX02157, EX02158
--   EX02159, EX02172, EX02173, EX02174, EX02175, EX02178, EX02179, EX02180, EX02181, EX02197
--   EX02198, EX02199, EX02201, EX02238, EX02259, EX02261, EX02296, EX02298, EX02386, EX02398
--   EX02400, EX02403, EX02428, EX02429, EX02430, EX02432, EX02433, EX02716
update public.exercises
set equipment_tags = equipment_tags - 'Barbell'
where equipment_tags ? 'Barbell'
  and name ~* '(dumbbell|kettlebell|\mkb\M)'
  and name !~* 'barbell'
  and (equipment_tags ? 'Dumbbells' or equipment_tags ? 'Kettlebell');
