#!/usr/bin/env node
// Friday writer: drafts next week's 7 Instagram posts into social_posts.
//
//   node scripts/social/write-week.mjs                 # next Monday's week
//   WEEK_START=2026-10-12 node scripts/social/write-week.mjs
//   FORCE=1 ...   regenerate every non-published post of the week
//   DRY_RUN=1 ... print instead of writing
//
// Workout content (exercises, sets, durations, equipment) is pulled from the real
// catalog and passed to the model as facts; the model only writes hooks, captions
// and on-screen text around them. The CTA is appended in code, never left to the model.
// Posts with status 'redo' are rewritten using the reviewer's note.
import { getServiceClient, mondayOf, addDays, CTA } from './lib/env.mjs';
import { generateJson } from './lib/llm.mjs';
import { loadCatalog, matchWorkouts, pickWorkout, summarizeWorkout, isTrulyEquipmentFree, isGentle, GYM_SCENARIOS } from './lib/workouts.mjs';

// slot -> weekday offset from Monday. Reels carry the reach, so they open and mid-week.
const PLAN = [
  { slot: 1, day: 0, kind: 'reel_workout' },
  { slot: 2, day: 1, kind: 'carousel_humour' },
  { slot: 3, day: 2, kind: 'reel_travel', variant: 'hotel_room' },
  { slot: 4, day: 3, kind: 'carousel_smarter' },
  { slot: 5, day: 4, kind: 'reel_workout' },
  { slot: 6, day: 5, kind: 'single_split' },
  { slot: 7, day: 6, kind: 'reel_travel', variant: 'jet_lag' },
];

const VOICE = `You write Instagram content for Raphyzone (@raphyzone), a workout app for people who travel, train without a coach and are tired of deciding what to do. Positioning: "Stop deciding. Start training." Tone: direct, dry-funny, warm, no hype, no emojis spam (max 2 per caption), no medical claims, no "shred/burn fat fast" language. Faceless brand: never write as if a person is on camera. Never invent workouts, exercises, numbers or app features: use only the FACTS you are given. Do not mention the call-to-action link; it is added automatically. Reply with a single JSON object only.`;

// What Raphyzone is, in one place. The model may use these facts but must never recite them as a list.
const BRAND = `WHAT RAPHYZONE DOES (background for you; weave in at most two of these per post, as one natural sentence, never as a feature list):
- It removes the mental load of training: you stop planning, searching and second-guessing.
- It schedules your workouts for you, around your week.
- It keeps track of your performance: every set, the weight, how it felt.
- It suggests improvements as you go (weights go up when it got easy, down when it was too hard).
- It has hundreds of workouts and builds a personalised plan from your preferences and the equipment you actually have.
- You can try it free for 30 days.`;

// The arc every post follows. Reels map it onto scenes, carousels onto slides.
const STORY = `STORY RULES (this is the most important part of the brief):
The post must sound like a person telling something that happened, not a brand announcing a product.
1. FEEL FIRST. The first line is a specific, relatable moment that makes the viewer think "oh, that's me": one concrete image (the 11 pm scroll through workout videos, standing in a hotel gym with no plan, the gym bag packed but no idea what to do with it), not a general statement about fitness. Address the viewer as "you". Never open with the brand name, a feature or a slogan.
2. STAY IN THE FEELING for one more beat. Make it a little more true or a little funnier, so the viewer nods.
3. THE TURN. Something changes: a small, quiet relief. Only here does Raphyzone appear, and as the thing that took the weight off ("it just told me what to do"), one benefit in plain words.
4. SHOW IT. Now the specific workout (name, time, equipment, from the FACTS), then what the app looks like. Show, do not explain.
5. INVITE. End by inviting them to try it free for 30 days, in the same easy voice as the rest.
Writing rules: write the way people talk, with contractions and short sentences that lean on the one before ("So you go. And then?"). Every line must follow from the previous one; read the on-screen texts in order and they should sound like one little monologue, not seven separate slogans. Concrete beats abstract. Vary rhythm. Do not recite features, do not use marketing words (seamless, effortless, unlock, elevate, journey, game-changer, personalised experience), and do not reuse the slogans "Stop deciding" or "Start training" (the end card already has them).`;

const COMMON_SHAPE = `"hook": string (max 60 chars, the first line / slide-1 text), "caption": string (max 700 chars, no hashtags, no call-to-action), "hashtags": string[] (8-12, no # sign, lowercase)`;

const SHAPES = {
  reel: `{ ${COMMON_SHAPE}, "scenes": [ { "seconds": number (3-6), "beat": "feel"|"deepen"|"turn"|"show", "on_screen_text": string (max 10 words, the only narration: there is no voiceover, so it must carry the beat on its own), "visual": "logo"|"plain"|"workout"|"warmup"|"format" (what sits behind the text, see the story order in the brief), "footage_query": string (2-4 words for stock-video search of a real-life moment that matches the line, e.g. "tired man couch phone", "hotel gym empty"; only used when visual is "plain") } ] (5-7 scenes, total seconds 25-45), "app_scene": { "headline": string (max 7 words, a human line that lands the story and invites them in, e.g. "Your week, already planned.") }, "music_mood": "calm"|"driving"|"upbeat" }`,
  carousel: `{ ${COMMON_SHAPE}, "slides": [ { "title": string (max 8 words), "body": string (max 25 words, may be empty) } ] (6-9 slides; slide 1 is the cover and repeats the hook; the last slide is a soft nudge to try Raphyzone) }`,
  single: `{ ${COMMON_SHAPE}, "slides": [ { "title": string (max 6 words), "body": string (the split: one line per day, "Day — focus", max 7 lines) } ] (exactly 1 slide) }`,
};

function recentLines(rows) {
  return rows.map((r) => `- [${r.kind}] "${r.hook}" → reach ${r.reach ?? '?'}, saves ${r.saves ?? 0}, shares ${r.shares ?? 0}`).join('\n');
}

async function performanceContext(supabase) {
  const { data } = await supabase
    .from('social_weekly_metrics')
    .select('reach, saves, shares, social_posts(kind, hook)')
    .order('week_start', { ascending: false })
    .limit(14);
  const rows = (data || []).filter((r) => r.social_posts).map((r) => ({ ...r.social_posts, reach: r.reach, saves: r.saves, shares: r.shares }));
  if (!rows.length) return 'No performance data yet.';
  const score = (r) => ((r.saves ?? 0) * 2 + (r.shares ?? 0) * 3) / Math.max(r.reach ?? 1, 1);
  const sorted = [...rows].sort((a, b) => score(b) - score(a));
  return `Best recent posts (saves+shares per reach):\n${recentLines(sorted.slice(0, 3))}\nWeakest:\n${recentLines(sorted.slice(-2))}\nRepeat what worked in style, not in wording.`;
}

async function progressionFacts(supabase) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count: sessions } = await supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('created_date', since);
  return [
    'Raphyzone logs every set: the weight you used and how it felt (easy / normal / hard / failed).',
    'Progression rule in the app: after 2 or more recent sessions rated "easy" at the same weight, it proposes a bump: +2.5 kg for upper-body lifts, +5 kg for lower-body lifts. After 2+ "hard" or "failed" it proposes going down. You approve or ignore each suggestion.',
    'Starting weights come from a quick strength calibration, scaled by the program difficulty you pick, not a guess.',
    `Across all users, ${sessions ?? 0} workouts were completed in the last 30 days (use only if it makes a point; do not inflate).`,
  ].join('\n');
}

function validatePost(kind, out) {
  const isReel = kind.startsWith('reel');
  if (!out.hook || !out.caption) throw new Error('missing hook/caption');
  if (!Array.isArray(out.hashtags) || out.hashtags.length < 5) throw new Error('too few hashtags');
  if (isReel) {
    if (!Array.isArray(out.scenes) || out.scenes.length < 3) throw new Error('reel needs scenes');
    const total = out.scenes.reduce((a, s) => a + Number(s.seconds || 0), 0);
    if (total > 70) throw new Error(`reel too long (${total}s)`);
    if (!out.app_scene?.headline) throw new Error('missing app_scene');
    if (out.scenes.some((s) => s.visual && !['logo', 'plain', 'workout', 'warmup', 'format'].includes(s.visual))) throw new Error('bad scene visual');
    // The emotional story comes first: no brand logo or workout card until the viewer has been pulled in.
    if (out.scenes[0].visual !== 'plain') throw new Error('first scene must be a plain story scene (no logo or card)');
    const firstCard = out.scenes.findIndex((s) => s.visual && s.visual !== 'plain');
    if (firstCard !== -1 && firstCard < 3) throw new Error('need at least 3 plain story scenes before the workout');
    const texts = out.scenes.map((s) => s.on_screen_text || '');
    if (texts.some((t) => /stop deciding|start training/i.test(t))) throw new Error('slogan reused in scene text');
    if (/raphyzone/i.test(texts[0])) throw new Error('opening scene must not name the brand');
  } else {
    if (!Array.isArray(out.slides) || !out.slides.length) throw new Error('missing slides');
    if (out.slides.length > 10) throw new Error('more than 10 slides');
    if (kind === 'single_split' && out.slides.length !== 1) throw new Error('single image needs exactly 1 slide');
  }
  return out;
}

function finalize(out) {
  const body = out.caption.replace(/\s*Want this decided for you every day\?.*$/is, '').trim();
  const tags = out.hashtags.map((h) => String(h).replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_]/g, '')).filter(Boolean).slice(0, 15);
  return { caption: `${body}\n\n${CTA}`, hashtags: [...new Set(tags)] };
}

async function buildPrompt({ plan, catalog, recentIds, used, perf, progression }) {
  const { kind, variant } = plan;
  if (kind === 'reel_workout') {
    const scenarios = [...GYM_SCENARIOS].sort(() => Math.random() - 0.5);
    for (const sc of scenarios) {
      const w = pickWorkout(matchWorkouts(catalog, sc).filter((x) => !used.has(x.workout_id)), recentIds);
      if (!w) continue;
      const facts = summarizeWorkout(w);
      return {
        workoutIds: [w.workout_id],
        script: { scenario: sc.label, workout: facts },
        user: `Write a story reel. Premise: someone walks into ${sc.label} with ${sc.minutes} minutes and no plan. Pick ONE specific, relatable angle for the opening (for example the phone scroll for a workout that never starts, the lap around the machines pretending to have a plan, the third week of "I'll start Monday") and tell it as a small story that ends with the relief of being told what to do, the workout shown, the app shown, and an invitation to try it free.\nFACTS (the only workout you may describe):\n${JSON.stringify(facts)}\nMention the name, the time and the equipment exactly. Do not list every exercise in the on-screen text; the workout list is rendered separately.\nScene order (6-7 scenes), each line leading into the next:\n1) beat "feel", visual "plain": the recognisable moment, in one concrete image. This is the hook; no brand, no logo.\n2) beat "deepen", visual "plain": make it a little more true or funnier.\n3) beat "turn", visual "plain": the small change, "and then it just told me what to do" in your own words; Raphyzone can be named here, once, with one benefit from the brief.\n4) beat "show", visual "workout": the workout, with its name, ${facts.minutes} minutes and equipment (the workout card is shown behind the text).\n5) beat "show", visual "format": say in plain words what the ${facts.format} format means (the format explainer is shown behind the text).\n6) beat "show", visual "plain": the payoff in a human voice, e.g. "${facts.minutes} minutes. And I didn't have to think once."\nThe app screen follows automatically (your app_scene.headline is its caption), then the free-trial end card. The caption (max 700 chars) retells the same story in 3-5 short lines of your own, and may name one more thing the app does (tracking, scheduling or progression), never a list.\n${perf}\nJSON shape: ${SHAPES.reel}`,
      };
    }
    throw new Error('No workout matches any gym scenario');
  }
  if (kind === 'reel_travel') {
    const jet = variant === 'jet_lag';
    const base = matchWorkouts(catalog, { tokens: ['bodyweight'], minutes: jet ? 25 : 30, minMinutes: jet ? 8 : 15, requireGear: false })
      .filter(isTrulyEquipmentFree);
    // Gentle workouts are scarce, so the hotel-room reel avoids them and leaves them
    // for the jet-lag reel; each side falls back rather than failing the slot.
    const tiers = jet
      ? [base.filter((w) => isGentle(w) && !used.has(w.workout_id)), base.filter(isGentle), base.filter((w) => !used.has(w.workout_id) && (w.minutes ?? 99) <= 20)]
      : [base.filter((w) => !isGentle(w) && !used.has(w.workout_id)), base.filter((w) => !used.has(w.workout_id)), base];
    const pool = tiers.find((t) => t.length) || [];
    const w = pickWorkout(pool, recentIds);
    if (!w) throw new Error(`No bodyweight workout for ${variant}`);
    const facts = summarizeWorkout(w);
    const brief = jet
      ? 'Jet-lag session: arrived tired, body clock off, wants to move without wrecking tomorrow. Gentle, short, no heroics. Do not claim it cures jet lag.'
      : 'Hotel room, zero equipment, small space, quiet (no jumping if the workout is low-impact).';
    return {
      workoutIds: [w.workout_id],
      script: { scenario: variant, workout: facts },
      user: `Write a story reel about training on the road. ${brief}\nOpen on a specific, relatable travel moment the viewer will recognise (for example the 7 am hotel gym that turns out to be one treadmill, the suitcase with no shoes room, landing at midnight and telling yourself tomorrow). Then deepen it, then the turn: the relief of having something that already knew your equipment and your time. Then show the workout and invite them to try it free.\nFACTS (the only workout you may describe):\n${JSON.stringify(facts)}\nScene order (6-7 scenes), each line leading into the next:\n1) beat "feel", visual "plain": the recognisable moment. No brand, no logo.\n2) beat "deepen", visual "plain".\n3) beat "turn", visual "plain": the relief; Raphyzone can be named once, with one benefit from the brief.\n4) beat "show", visual "workout": the workout name, time and equipment (the card is shown behind the text).\n5) beat "show", visual "plain": what it feels like to just do it, in a human voice.\nThe app screen follows automatically (your app_scene.headline is its caption), then the free-trial end card. The caption retells the story in 3-5 short lines.\n${perf}\nJSON shape: ${SHAPES.reel}`,
    };
  }
  if (kind === 'carousel_humour') {
    return {
      workoutIds: [],
      user: `Write a carousel about decision fatigue in training: the 20 minutes of scrolling for a workout, the hotel gym staring contest, "chest day or legs?", rearranging the same plan. Slide 1 must be a moment the viewer recognises as themselves. The middle slides escalate it with dry humour, one beat each, written so each slide follows from the last. The turn comes about two slides from the end: the relief of having it decided (workouts picked for your equipment, time and level, scheduled for you). The final slide invites them to try it free for 30 days, in a human line, not a slogan.\n${perf}\nJSON shape: ${SHAPES.carousel}`,
    };
  }
  if (kind === 'carousel_smarter') {
    return {
      workoutIds: [],
      user: `Write a "train smarter" carousel about progression and tracking. Start with a moment the viewer recognises (training for months and being unable to say if they got stronger, the notes app full of half-remembered weights). Teach one idea (progressive overload via logging how sets felt), then show how Raphyzone does it so you do not have to remember anything, and end by inviting them to try it free for 30 days. Slides read as one short story, not a lecture. FACTS you may use:\n${progression}\n${perf}\nJSON shape: ${SHAPES.carousel}`,
    };
  }
  // single_split: a real week built from catalog workouts of different focus
  const focusOrder = ['push', 'pull', 'legs'];
  const chosen = [];
  for (const f of focusOrder) {
    const w = pickWorkout(catalog.filter((x) => (x.movement_focus === f || String(x.split || '').toLowerCase() === f) && x.minutes && !used.has(x.workout_id) && x.blocks.length), recentIds);
    if (w) { chosen.push({ focus: f, name: w.name, minutes: w.minutes, id: w.workout_id }); used.add(w.workout_id); }
  }
  if (chosen.length < 3) throw new Error('Not enough push/pull/legs workouts for a split');
  return {
    workoutIds: chosen.map((c) => c.id),
    script: { split: chosen },
    user: `Write a single save-for-later image: a 3-day push / pull / legs split, built from real Raphyzone workouts. Use exactly these as the three training days and add rest/mobility days only to fill a 5-7 line week. FACTS:\n${JSON.stringify(chosen.map(({ focus, name, minutes }) => ({ focus, name, minutes })))}\nThe title should make people save it. Caption: open with a recognisable feeling (the Sunday-night 'what am I even training this week?'), then how to run the week, then one line on why having the week decided and scheduled for you takes that weight off, and that you can try it free for 30 days.\n${perf}\nJSON shape: ${SHAPES.single}`,
  };
}

async function main() {
  const supabase = getServiceClient();
  const weekStart = process.env.WEEK_START || mondayOf(new Date(Date.now() + 3 * 86400000)); // Friday run -> next Monday
  if (new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1) throw new Error(`WEEK_START ${weekStart} is not a Monday`);
  const dry = !!process.env.DRY_RUN;

  const { data: existing } = await supabase.from('social_posts').select('*').eq('week_start', weekStart);
  const bySlot = new Map((existing || []).map((p) => [p.slot, p]));
  const todo = PLAN.filter((p) => {
    const cur = bySlot.get(p.slot);
    if (!cur) return true;
    if (cur.status === 'published') return false;
    return cur.status === 'redo' || !!process.env.FORCE;
  });
  if (!todo.length) { console.log(`Week ${weekStart}: nothing to write.`); return; }

  const [catalog, perf, progression] = await Promise.all([loadCatalog(supabase), performanceContext(supabase), progressionFacts(supabase)]);
  const { data: recent } = await supabase.from('social_posts').select('source_workout_ids').gte('week_start', addDays(weekStart, -42)).neq('week_start', weekStart);
  const recentIds = new Set((recent || []).flatMap((r) => r.source_workout_ids));
  const used = new Set((existing || []).filter((p) => !todo.some((t) => t.slot === p.slot)).flatMap((p) => p.source_workout_ids));

  const logCall = (row) => { if (!dry) supabase.from('llm_call_logs').insert(row).then(({ error }) => error && console.error('llm_call_logs insert failed:', error.message)); };
  const failures = [];
  for (const plan of todo) {
    try {
    const cur = bySlot.get(plan.slot);
    const built = await buildPrompt({ plan, catalog, recentIds, used, perf, progression });
    built.workoutIds.forEach((id) => used.add(id));
    const note = cur?.redo_note ? `\nThe reviewer rejected the previous version${cur.hook ? ` ("${cur.hook}")` : ''}. Their note: ${cur.redo_note}. Write a clearly different take.` : '';
    const out = await generateJson({ system: `${VOICE}\n\n${BRAND}\n\n${STORY}`, user: built.user + note, validate: (o) => validatePost(plan.kind, o), log: logCall });
    const { caption, hashtags } = finalize(out);
    const isReel = plan.kind.startsWith('reel');
    const row = {
      week_start: weekStart,
      slot: plan.slot,
      kind: plan.kind,
      status: 'draft',
      hook: out.hook.slice(0, 120),
      caption,
      hashtags,
      slides: isReel ? [] : out.slides,
      script: isReel ? { ...built.script, scenes: out.scenes, app_scene: { ...out.app_scene, workout_id: built.workoutIds[0] }, music_mood: out.music_mood || 'upbeat' } : built.script ?? null,
      source_workout_ids: built.workoutIds,
      asset_urls: [],
      render_status: 'pending',
      render_error: null,
      redo_note: null,
      publish_error: null,
      scheduled_date: addDays(weekStart, plan.day),
      updated_date: new Date().toISOString(),
    };
    if (dry) { console.log(JSON.stringify(row, null, 2)); continue; }
    const { error } = await supabase.from('social_posts').upsert(row, { onConflict: 'week_start,slot' });
    if (error) throw error;
    console.log(`Slot ${plan.slot} (${plan.kind}): "${row.hook}"`);
    } catch (err) {
      failures.push(plan.slot);
      console.error(`Slot ${plan.slot} (${plan.kind}) failed: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(`Slots failed: ${failures.join(', ')} (rerun to retry just those)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
