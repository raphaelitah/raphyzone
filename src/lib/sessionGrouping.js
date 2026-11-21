// Pairs every block_exercise slot up with its logged exercise_session (matched
// by exercise_id, consumed in block/order_in_block sequence) so history can be
// grouped exactly like the library view — including slots that were skipped
// (no matching log). Anything logged that doesn't match any slot (e.g. a
// substituted exercise) is returned separately and rendered without a block.
export function groupSessionsByBlock(blocks, blockExercisesByBlock, exerciseSessions, added = [], sequence = null) {
  const remaining = exerciseSessions.slice();
  const groups = [];
  blocks.forEach((block) => {
    const blockExs = (blockExercisesByBlock[block.block_id] || []).filter((be) => be.step_type === 'exercise');
    if (!blockExs.length) return;
    const items = blockExs.map((be) => {
      const idx = remaining.findIndex((es) => es.exercise_id === be.exercise_id);
      if (idx === -1) return { be, es: null };
      const es = remaining[idx];
      remaining.splice(idx, 1);
      return { be, es };
    });
    groups.push({ block, items });
  });
  // Exercises the athlete added during the session aren't in the saved workout: show
  // each as its own block, in the position they were run.
  added.forEach((a) => {
    const code = a.exercise?.exercise_code;
    if (!code) return;
    const idx = remaining.findIndex((es) => es.exercise_id === code);
    const es = idx === -1 ? null : remaining.splice(idx, 1)[0];
    groups.push({
      block: { block_id: `added:${a.key}`, block_label: '+', block_type: 'added', rounds: 1 },
      items: [{ be: { block_exercise_id: a.key, exercise_id: code, exercise_title_raw: a.exercise.name }, es }],
    });
  });
  if (Array.isArray(sequence) && sequence.length) {
    const rank = new Map(sequence.map((id, i) => [id, i]));
    const at = (g) => (rank.has(g.block.block_id) ? rank.get(g.block.block_id) : Infinity);
    groups.sort((a, b) => at(a) - at(b)); // stable: anything not in the order keeps its place at the end
  }
  return { groups, leftover: remaining };
}

// A slot with no saved result isn't necessarily a skip: the runner only drops the
// result of an exercise that was skipped before it started. If its sets were run
// (the saved progress has started panel state for it) the result just wasn't saved.
export function wasWorkedOn(panel, block, be) {
  const state = panel?.[be.block_exercise_id] || panel?.[block.block_id];
  return !!state?.hasStartedBlock;
}
