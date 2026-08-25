insert into public.block_exercises (block_exercise_id,block_id,step_type,exercise_id,exercise_title_raw,referenced_workout_id,referenced_block_id,order_in_block,prescription_type,prescription_value,load_type,load_value,notes,created_date,updated_date) values
('BE00068','BLK00035','exercise','EX01083','Goblet Squat',NULL,NULL,1,'reps','12',NULL,NULL,'3 sets x 12 reps - Dumbbell 22 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00069','BLK00036','exercise','EX02462','Standing Calf Raise',NULL,NULL,1,'reps','15',NULL,NULL,'4 sets x 15 reps - Dumbbells 22 kg (same weight as goblet, no change)','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00070','BLK00037','exercise','EX00155','Back Supported Dumbbell Shoulder Press',NULL,NULL,1,'reps','12',NULL,NULL,'4 sets x 12 reps - Dumbbells 20 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00071','BLK00038','exercise','EX00360','Bent Over Dumbbell Lateral Raise',NULL,NULL,1,'reps','8',NULL,NULL,'Tri-set, 4 rounds x 8 reps - Dumbbells 8 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00072','BLK00038','exercise','EX00511','Chest Supported Incline Rear Delt Raise',NULL,NULL,2,'reps','8',NULL,NULL,'Tri-set, 4 rounds x 8 reps - Dumbbells 8 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00073','BLK00038','exercise','EX00767','Dumbbell Frontal Raise',NULL,NULL,3,'reps','8',NULL,NULL,'Tri-set, 4 rounds x 8 reps - Dumbbells 8 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00074','BLK00039','exercise','EX00813','Dumbbell Shrug',NULL,NULL,1,'reps','15',NULL,NULL,'3 sets x 15 reps - Barbell 50 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00075','BLK00040','exercise','EX00313','Barbell V Leg Raise',NULL,NULL,1,'reps','15',NULL,NULL,'3 sets x 15 reps','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00076','BLK00040','exercise','EX00965','Forearm Plank',NULL,NULL,2,'time','1 minute',NULL,NULL,'3 sets x 60 sec','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00077','BLK00041','exercise','EX01906','Romanian Deadlift',NULL,NULL,1,'reps','10 reps',NULL,NULL,'4 sets x 10 reps','2026-08-23T21:03:11.249000','2026-08-24T16:41:25.595000'),
('BE00078','BLK00042','exercise','EX00781','Dumbbell Hip Thrust',NULL,NULL,1,'reps','12 reps',NULL,NULL,'3 sets x 12 reps','2026-08-23T21:03:11.249000','2026-08-24T16:41:43.288000'),
('BE00079','BLK00043','exercise','EX02146','Single Arm Dumbbell Romanian Deadlift',NULL,NULL,1,'reps','10 reps',NULL,NULL,'3 sets x 10 reps','2026-08-23T21:03:11.249000','2026-08-24T16:41:50.968000'),
('BE00081','BLK00045','exercise','EX00724','Dumbbell Bench Press',NULL,NULL,1,'reps','12',NULL,NULL,'Superset x4 rounds x 12 reps - Dumbbells 22 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000'),
('BE00082','BLK00045','exercise','EX00507','Chest Supported Dumbbell Row',NULL,NULL,2,'reps','12',NULL,NULL,'Superset x4 rounds x 12 reps - Dumbbells 22 kg','2026-08-23T21:03:11.249000','2026-08-23T21:03:11.249000')
on conflict (block_exercise_id) do nothing;
