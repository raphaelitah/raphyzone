-- Asgard Strength's two blocks (BLK00309: 8-round EMOM, BLK00310: 8-minute
-- AMRAP with a 3-minute rest before it) and Commcorr 7's alternating-EMOM
-- block (BLK00371) were tagged block_type = 'superset' while also carrying
-- an EMOM/AMRAP workout_format. deriveBlockTimerConfig() in
-- src/lib/workoutStructure.js checks isSupersetBlock() (block_type OR
-- workout_format = 'superset') before isEMOMBlock()/isAMRAPBlock(), so the
-- literal 'superset' block_type won out and the live player rendered these
-- via SupersetPanel instead of the EMOM/AMRAP block timer — producing the
-- same-exercise-twice-in-a-row glitch the coaching-quality agent caught on
-- Asgard Strength. Other confirmed EMOM/AMRAP blocks in the catalog use
-- block_type = 'standalone' (e.g. BLK00151, BLK00073), so align these to
-- that convention.
update public.workout_blocks
set block_type = 'standalone'
where block_id in ('BLK00309', 'BLK00310', 'BLK00371')
  and block_type = 'superset';
