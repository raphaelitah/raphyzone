// The exercises table (~2900 rows) exceeds PostgREST's default 1000-row cap, so a
// plain .select() silently returns only the first 1000 — warm-up pattern-mate
// lookups then miss most of the catalog and fall back to the workout's own first
// exercise. Page through with .range() to get every row.
const CATALOG_COLUMNS = 'id, name, exercise_code, movement_category, body_region, movement_pattern, primary_muscle_group, secondary_muscle_group, equipment_tags, modality, dumbbell_substitutable';
const PAGE_SIZE = 1000;

export async function loadExerciseCatalog(supabase: any): Promise<{ data: any[] }> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('exercises')
      .select(CATALOG_COLUMNS)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows };
}
