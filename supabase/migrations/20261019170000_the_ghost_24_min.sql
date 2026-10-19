-- The Ghost is 6 rounds x (3 x 1 min work + 1 min rest) = 24 min, not 23.

update workouts
   set est_duration_min = 24, updated_date = now()
 where name = 'The Ghost' and workout_id = 'e22d42f5b541a7ef79ed8a4b';
