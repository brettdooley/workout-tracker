// Brett's starting routine (Post-Race Strength & Cut, Nov 2026) and the form notes for each exercise.

export const STARTING_TEMPLATE = `# Program: Post-Race Strength & Cut (Nov 2026)
Start: 2026-11-16
> Main strength sets: about 1-3 reps in reserve.
> Add reps within the range before adding weight.
> Keep technique consistent and joint range comfortable.
> All muscle-up work strict and controlled: no kipping or swinging.
> Cut accessory work if climbing or shoulder fatigue hurts recovery.
> Back off intensity or volume if knee pain, swelling or shoulder symptoms increase.
> Review progress every four weeks.

## Monday: Lower A (Quads & Glutes)
+ Routine A
+ Routine B
+ Lower Warm-up
Elevated Single-Leg Squat [bodyweight] | 3 x 6-10/leg
Weighted Split Squat | 3 x 8-12/leg
Dumbbell Hip Thrust | 3 x 10-15
Single-Leg Calf Raise [bodyweight] | 3 x 10-15/leg
Straight-Leg Hollow-Body Hold [timed] | 3 x 20-40s

## Tuesday: Upper A + Climbing
+ Routine A
+ Upper Warm-up
Supported False-Grip Ring Hold [timed] | 3 x 15-30s
False-Grip Ring Row [bodyweight] | 2 x 5-8
Climbing [check] | 90-120 min
Weighted Ring Dip [bodyweight] | 3 x 5-8
Incline Dumbbell Bench | 3 x 6-10
Chest-Supported Dumbbell Row | 2 x 8-12

## Wednesday: Cycling (Power Development)
+ Routine A
+ Routine B
Cycling Intervals [check] | 50-75 min
~ Week 1, Sprint power: 15 min progressive warm-up. 6 x 8-10 sec hard accelerations, 4-5 min easy between. Easy aerobic riding and cooldown.
~ Week 2, VO2max / 3-minute power: 15 min warm-up. 4 x 3 min at about 110-120% FTP, 3 min easy between. Cooldown.
~ Week 3, Anaerobic power: 15 min warm-up. 4 x 30 sec hard, 4-5 min easy between. Cooldown.
~ Week 4, Recovery: 45-60 min easy Zone 2. No high-intensity intervals.

## Thursday: Upper B + Climbing
+ Routine A
+ Upper Warm-up
Chest-High Strict Bar Pull-up [bodyweight] | 3 x 3-5 | strict, no kip
Foot-Assisted Strict Ring Muscle-up Transition [bodyweight] | 3 x 3-5 | strict, no kip
Climbing [check] | 90-120 min
Weighted Push-up [bodyweight] | 3 x 8-12
Flat Neutral-Grip Dumbbell Bench | 3 x 8-12
Dumbbell Lateral Raise | 2 x 12-15 | comfortable range

## Friday: Lower B (Glutes & Hamstrings)
+ Routine A
+ Lower Warm-up
Single-Leg Romanian Deadlift | 3 x 8-12/leg
Dumbbell Hip Thrust | 3 x 8-15
Low Step-up | 2 x 8-12/leg
Slider Hamstring Curl [bodyweight] | 2 x 8-12
Single-Leg Calf Raise [bodyweight] | 2 x 12-20/leg
Pallof Press [bodyweight] | 2 x 10/side | band

## Saturday: Zone 2 Cycling
+ Routine A
+ Routine B
Zone 2 Ride [check] | 60-90 min

## Sunday: Recovery
+ Routine A
Easy Walk [check] | optional
Weekly Review [check] | bodyweight trend, training progress, recovery

## Block: Routine A (Daily Mobility)
Thoracic Extension (foam roller) [bodyweight] | 1 x 8
Thread the Needle [bodyweight] | 1 x 6/side
Wall Angel [bodyweight] | 2 x 8
Shoulder-Blade Glide [bodyweight] | 1 x 10
Hand-Behind-Back Slide [bodyweight] | 1 x 5/side
Supine Pelvic Tilt [bodyweight] | 1 x 10
Dead Bug [bodyweight] | 1 x 8/side
Left-Knee Heel Slide [bodyweight] | 1 x 15
Unweighted Squat Mobility [timed] | 2 x 30s
Half-Kneeling Hip Flexor Stretch [timed] | 1 x 30s/side | optional

## Block: Routine B (Shoulder PT)
Banded External Rotation [bodyweight] | 2 x 15-20/side
Banded Internal Rotation [bodyweight] | 2 x 15-20/side
Multidirectional Band Sequence [bodyweight] | 2 x 8-10

## Block: Lower Warm-up
Easy Cardio [check] | 5 min
Bodyweight Squats [check] | 10 reps
Hip Hinges [check] | 8 reps
Lighter Ramp-up Sets [check] | 1-2 sets

## Block: Upper Warm-up
Easy Movement [check]
Wrist & Shoulder Rotations [check]
Progressive Easy Climbing [check]
`;

// The first version, used to recognize an unedited copy on the phone and upgrade it.
export const SEED_V1 = `# Program: Post-Race Strength & Cut (Nov 2026)
Start: 2026-11-16
> Main strength sets: about 1-3 reps in reserve.
> Add reps within the range before adding weight.
> Keep technique consistent and joint range comfortable.
> All muscle-up work strict and controlled: no kipping or swinging.
> Cut accessory work if climbing or shoulder fatigue hurts recovery.
> Back off intensity or volume if knee pain, swelling or shoulder symptoms increase.
> Review progress every four weeks.

## Monday: Lower A (Quads & Glutes)
> Warm-up: 5 min easy cardio, 10 bodyweight squats, 8 hip hinges, 1-2 lighter sets
Elevated Single-Leg Squat [bodyweight] | 3 x 6-10/leg
Weighted Split Squat | 3 x 8-12/leg
Dumbbell Hip Thrust | 3 x 10-15
Single-Leg Calf Raise [bodyweight] | 3 x 10-15/leg
Straight-Leg Hollow-Body Hold [timed] | 3 x 20-40s
+ Routine A
+ Routine B

## Tuesday: Upper A + Climbing
> Warm-up: easy movement, wrist/shoulder rotations, progressive easy climbing
Supported False-Grip Ring Hold [timed] | 3 x 15-30s
False-Grip Ring Row [bodyweight] | 2 x 5-8
Climbing [check] | 90-120 min
Weighted Ring Dip [bodyweight] | 3 x 5-8
Incline Dumbbell Bench | 3 x 6-10
Chest-Supported Dumbbell Row | 2 x 8-12
+ Routine A

## Wednesday: Cycling (Power Development)
Cycling Intervals [check] | 50-75 min
~ Week 1, Sprint power: 15 min progressive warm-up. 6 x 8-10 sec hard accelerations, 4-5 min easy between. Easy aerobic riding and cooldown.
~ Week 2, VO2max / 3-minute power: 15 min warm-up. 4 x 3 min at about 110-120% FTP, 3 min easy between. Cooldown.
~ Week 3, Anaerobic power: 15 min warm-up. 4 x 30 sec hard, 4-5 min easy between. Cooldown.
~ Week 4, Recovery: 45-60 min easy Zone 2. No high-intensity intervals.
+ Routine A
+ Routine B

## Thursday: Upper B + Climbing
> Warm-up: easy movement, wrist/shoulder rotations, progressive easy climbing
Chest-High Strict Bar Pull-up [bodyweight] | 3 x 3-5 | strict, no kip
Foot-Assisted Strict Ring Muscle-up Transition [bodyweight] | 3 x 3-5 | strict, no kip
Climbing [check] | 90-120 min
Weighted Push-up [bodyweight] | 3 x 8-12
Flat Neutral-Grip Dumbbell Bench | 3 x 8-12
Dumbbell Lateral Raise | 2 x 12-15 | comfortable range

## Friday: Lower B (Glutes & Hamstrings)
> Warm-up: 5 min easy cardio, 10 bodyweight squats, 8 hip hinges, 1-2 lighter sets
Single-Leg Romanian Deadlift | 3 x 8-12/leg
Dumbbell Hip Thrust | 3 x 8-15
Low Step-up | 2 x 8-12/leg
Slider Hamstring Curl [bodyweight] | 2 x 8-12
Single-Leg Calf Raise [bodyweight] | 2 x 12-20/leg
Pallof Press [bodyweight] | 2 x 10/side | band

## Saturday: Zone 2 Cycling
Zone 2 Ride [check] | 60-90 min
+ Routine A
+ Routine B

## Sunday: Recovery
Easy Walk [check] | optional
Weekly Review [check] | bodyweight trend, training progress, recovery
+ Routine A

## Block: Routine A (Daily Mobility)
Thoracic Extension (foam roller) [bodyweight] | 1 x 8
Thread the Needle [bodyweight] | 1 x 6/side
Wall Angel [bodyweight] | 2 x 8
Shoulder-Blade Glide [bodyweight] | 1 x 10
Hand-Behind-Back Slide [bodyweight] | 1 x 5/side
Supine Pelvic Tilt [bodyweight] | 1 x 10
Dead Bug [bodyweight] | 1 x 8/side
Left-Knee Heel Slide [bodyweight] | 1 x 15
Supported Elevated Left-Leg Squat (mobility) [bodyweight] | 2 x 5 | slow, don't force depth
Half-Kneeling Hip Flexor Stretch [timed] | 1 x 30s/side | optional

## Block: Routine B (Shoulder PT)
Banded External Rotation [bodyweight] | 2 x 15-20/side
Banded Internal Rotation [bodyweight] | 2 x 15-20/side
Multidirectional Band Sequence [bodyweight] | 2 x 8-10
Wall Push-up Plus [bodyweight] | 2 x 10-15
Light Band Low Row [bodyweight] | 2 x 12-15
`;

export const EXERCISE_NOTES = {
  'Thoracic Extension (foam roller)': 'Foam roller horizontal beneath upper back. Keep butt on floor, lightly brace abdomen, extend upper back over the stationary roller. Four reps at each of two positions.',
  'Thread the Needle': 'On hands and knees, rotate upper back by reaching one arm underneath the opposite arm. Can substitute side-lying open books, 6/side.',
  'Wall Angel': 'Back against wall, arms slide from W toward Y. Avoid arching lower back or forcing arms against the wall.',
  'Shoulder-Blade Glide': 'Arms straight forward at chest height. Move shoulder blades forward and backward without bending elbows.',
  'Hand-Behind-Back Slide': 'Slide back of hand gently upward along spine. Stop before lat cramping or pinching.',
  'Supine Pelvic Tilt': 'On back with knees bent, gently alternate anterior and posterior pelvic tilts.',
  'Dead Bug': 'Opposite arm and leg extend while trunk stays stable.',
  'Left-Knee Heel Slide': 'Slide left heel toward buttocks, pause two seconds at comfortable resistance, then extend.',
  'Banded External Rotation': 'Elbow near side, rotate forearm against band resistance through comfortable range.',
  'Banded Internal Rotation': 'Elbow near side, rotate forearm against band resistance through comfortable range.',
  'Multidirectional Band Sequence': 'Stand on band, raise arms forward, move outward to T position, return forward, raise overhead, and reverse.',
  'Chest-High Strict Bar Pull-up': 'Strict, controlled, no kipping or swinging.',
  'Foot-Assisted Strict Ring Muscle-up Transition': 'Strict, controlled, no kipping or swinging.',
};
