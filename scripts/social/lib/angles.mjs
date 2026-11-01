// Story angles for the Friday writer. Each post gets one angle (a situation workout-goers
// recognise themselves in), so posts in a week, and across weeks, do not retell the same idea.
// Add new entries freely: the picker rotates through the pool, least-recently-used first.

const GYM = [
  { id: 'no_idea', text: 'NOT KNOWING WHAT TO DO. You are ready: shoes on, time set aside. But when it comes to the actual session you have no idea what to do today, so you drift between machines hoping something occurs to you.' },
  { id: 'tired_choosing', text: 'TIRED OF CHOOSING. You decide things all day at work. By the time you reach the gym your head is empty and one more decision (chest or legs? which weight? how many sets?) feels like too much. You just want someone to say "do this".' },
  { id: 'bored', text: 'THE SAME OLD ROUTINE. You have done the same few exercises for months. You know them by heart, none of it excites you any more, and looking for something new feels like homework, so you do the same thing again. The turn: something new that still fits your gear and time, picked for you.' },
  { id: 'one_thing', text: 'ONLY ONE THING YOU KNOW. You have no idea what you want to do today, only what you do not want: not another leg day, no running, nothing with burpees. Knowing what you do not want is not a plan. The turn: a session built around your preferences and the gear you have.' },
  { id: 'lost_coach', text: 'THE COACH IS GONE. For a long time someone else decided: a coach, or a friend who just said "we are doing legs". Now you train alone and the freedom feels like a weight. The turn: something that decides the way they used to.' },
  { id: 'cant_build', text: 'NOT EXPERIENCED ENOUGH TO BUILD YOUR OWN. You do not know enough to put a session together, or to scale one you saw online: how many sets, what weight, what to swap when the gear is not there. The fear is doing it wrong. The turn: a session that already fits your level and equipment.' },
  { id: 'hardest_decision', text: 'THE HARDEST DECISION IS MADE. You already did the hard part: you decided to train, packed the bag, got there, got changed. And now you are standing in the gym with no plan, about to waste all that effort. The turn: that effort deserves a plan waiting for it.' },
  { id: 'wrong_workout', text: 'THE WORKOUT THAT DOES NOT FIT. You saved a workout from the internet. It needs a rack, a sled and ninety minutes; you have a bench and half an hour. Adapting it takes longer than doing it. The turn: workouts matched to your equipment and your time from the start.' },
  { id: 'short_on_time', text: 'SHORT ON TIME. All you have is a slot between work and everything else, and you could spend half of it working out what to do. The turn: none of that time is wasted on deciding. (Do not name how long the slot is: the length of the workout is the time they have.)' },
  { id: 'comeback', text: 'STARTING OVER. A busy few weeks or a break, and the longer you stay away the bigger restarting feels. You do not even know what a reasonable first session back looks like. The turn: an easy way back, already decided.' },
  { id: 'week_chaos', text: 'A WEEK WITHOUT A SHAPE. You mean to train three or four times, but nothing is planned, so it happens on whichever days the guilt wins. The turn: sessions scheduled around your week, so "when" and "what" are settled before you get there.' },
];

const TRAVEL_ROOM = [
  { id: 'free_slot', text: 'THE FREE SLOT. A packed day of meetings, one free gap, a hotel room with a bit of floor and nothing else. Not knowing what you can even do with no equipment is what makes you skip it.' },
  { id: 'no_gear_no_idea', text: 'NO GEAR, NO IDEA. In a hotel room with nothing to lift you do not know what counts as a real workout, or how to make bodyweight work hard enough. You end up doing a few push-ups and calling it a day. The turn: a proper session built for exactly this.' },
  { id: 'trainer_not_here', text: 'YOUR TRAINER IS NOT HERE. At home, a coach or a training partner decides what you do. On this trip you are alone in a hotel room, and without them you do not know where to start. The turn: it decides the way they would.' },
  { id: 'too_tired_to_think', text: 'TOO TIRED TO THINK. After a long day of meetings and a late dinner you want to move, but one more decision is more than you can face. The turn: nothing to figure out, just press start.' },
];

const TRAVEL_JET = [
  { id: 'broken_streak', text: 'THE BROKEN STREAK. You told yourself you would keep training on this trip. It is day four, you have skipped everything, the guilt is louder than the tiredness, and starting again feels like a big deal. The turn: it does not have to be big, just something gentle and already decided.' },
  { id: 'wrong_hour', text: 'AWAKE AT THE WRONG HOUR. You wake up jet-lagged, body clock off, wanting to move but not wreck the day, and with no idea what is sensible after a long flight. The turn: something gentle, short, already chosen for you.' },
  { id: 'back_after_flights', text: 'BACK AFTER THE TRAVEL DAYS. Two days of airports and cramped seats, no training since, and now the first morning in the hotel. You are unsure how easy to go. The turn: an easy restart, decided for you.' },
];

const HUMOUR = [
  { id: 'scroll_loop', text: 'THE SEARCH THAT EATS THE PLAN. You scroll the evening before to plan tomorrow\'s session, and forty minutes later you have watched cooking videos and still have no plan.' },
  { id: 'dumbbell_staring', text: 'THE STARING CONTEST. Standing in front of the dumbbells, chest or legs, then both, then neither, until someone needs the bench.' },
  { id: 'start_monday', text: 'I WILL START MONDAY. Every Monday a brand new plan that lasts until Wednesday.' },
  { id: 'same_three', text: 'THE SAME THREE EXERCISES. Rearranging the same plan and calling it a new programme.' },
  { id: 'wish_someone_said', text: 'WISHING SOMEONE JUST SAID "DO THIS". Not a lecture, not a menu, just a sentence.' },
];

function poolFor(plan) {
  if (plan.kind === 'reel_workout') return GYM;
  if (plan.kind === 'reel_travel') return plan.variant === 'jet_lag' ? TRAVEL_JET : TRAVEL_ROOM;
  if (plan.kind === 'carousel_humour') return HUMOUR;
  return null;
}

// recent: angle ids, most recent first. taken: ids already used by other posts this week (any pool).
// Picks the angle used longest ago (never used first), random among ties.
export function pickAngle(plan, recent, taken, rng = Math.random) {
  const pool = poolFor(plan);
  if (!pool) return null;
  const free = pool.filter((a) => !taken.has(a.id));
  const from = free.length ? free : pool;
  const age = (a) => { const i = recent.indexOf(a.id); return i === -1 ? Infinity : i; };
  const best = Math.max(...from.map(age));
  const ties = from.filter((a) => age(a) === best);
  return ties[Math.floor(rng() * ties.length)];
}
