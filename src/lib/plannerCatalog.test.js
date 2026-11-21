import { describe, it, expect } from 'vitest';
import { loadPlannerCatalog } from '../../supabase/functions/_shared/entitlements.ts';
import { buildWorkoutCatalog, filterCatalogForSelection } from '../../supabase/functions/_shared/planContext.ts';

// A stand-in for the service-role client: records the filters each query is given and
// answers from fixed tables.
function fakeSupabase({ premium = true, catalog = [], own = [], ownError = null, catalogError = null } = {}) {
  const queries = [];
  const client = {
    rpc: async () => ({ data: premium, error: null }),
    from: () => {
      const q = { filters: [] };
      queries.push(q);
      const api = {
        select: () => api,
        order: () => api,
        limit: (n) => { q.limit = n; return api; },
        eq: (col, val) => { q.filters.push([col, val]); return api; },
        then: (resolve, reject) => {
          const isOwn = q.filters.some(([c]) => c === 'owner_id');
          const result = isOwn ? { data: own, error: ownError } : { data: catalog, error: catalogError };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return { client, queries };
}

const official = (id, extra = {}) => ({ id, workout_id: `W${id}`, name: `Official ${id}`, status: 'approved', modality: 'Strength / Muscular Endurance', ...extra });
const mine = (id, extra = {}) => ({ id, workout_id: `WK-${id}`, name: `Mine ${id}`, status: 'private', modality: 'Strength / Muscular Endurance', ...extra });

describe('loadPlannerCatalog', () => {
  it('offers the athlete their own saved workouts, listed before the catalog', async () => {
    const { client } = fakeSupabase({ catalog: [official('a'), official('b')], own: [mine('x')] });
    const { data, error } = await loadPlannerCatalog(client, 'u1');
    expect(error).toBeNull();
    expect(data.map((w) => w.id)).toEqual(['x', 'a', 'b']);
  });

  it('only ever asks for private workouts owned by this athlete, newest first, capped', async () => {
    const { client, queries } = fakeSupabase({ catalog: [], own: [] });
    await loadPlannerCatalog(client, 'u1');
    const ownQuery = queries.find((q) => q.filters.some(([c]) => c === 'owner_id'));
    expect(ownQuery.filters).toEqual([['owner_id', 'u1'], ['status', 'private']]);
    expect(ownQuery.limit).toBe(30);
  });

  it('keeps the free-tier catalog restriction, but still offers a free athlete their own workouts', async () => {
    const { client, queries } = fakeSupabase({ premium: false, catalog: [official('a')], own: [mine('x')] });
    const { data } = await loadPlannerCatalog(client, 'u1');
    const catalogQuery = queries.find((q) => !q.filters.some(([c]) => c === 'owner_id'));
    expect(catalogQuery.filters).toContainEqual(['is_free', true]);
    expect(data.map((w) => w.id)).toEqual(['x', 'a']);
  });

  it('falls back to the catalog alone if the athlete\'s own workouts can\'t be loaded, but fails if the catalog can\'t', async () => {
    const ok = await loadPlannerCatalog(fakeSupabase({ catalog: [official('a')], ownError: { message: 'boom' } }).client, 'u1');
    expect(ok.data.map((w) => w.id)).toEqual(['a']);
    const failed = await loadPlannerCatalog(fakeSupabase({ catalogError: { message: 'down' } }).client, 'u1');
    expect(failed.error).toEqual({ message: 'down' });
  });
});

describe('buildWorkoutCatalog', () => {
  it('labels the athlete\'s own workouts so the model can tell them apart', () => {
    const rows = buildWorkoutCatalog([official('a'), mine('x', { name: 'Pull plus chest' })]).split('\n');
    expect(rows[1].split('|')[1]).toBe('Official a');
    expect(rows[2].split('|')[1]).toBe('Pull plus chest [my workout]');
  });

  it('keeps a "|" in a saved name from breaking the row format', () => {
    const rows = buildWorkoutCatalog([mine('x', { name: 'Push | Pull day' })]).split('\n');
    expect(rows[1].split('|')).toHaveLength(7);
    expect(rows[1].split('|')[1]).toBe('Push / Pull day [my workout]');
  });
});

describe('the per-modality cap', () => {
  it('cannot push the athlete\'s own workouts out of the candidates (they are listed first)', async () => {
    const crowded = Array.from({ length: 30 }, (_, i) => official(`o${i}`));
    const { client } = fakeSupabase({ catalog: crowded, own: [mine('x')] });
    const { data } = await loadPlannerCatalog(client, 'u1');
    const filtered = filterCatalogForSelection(data, { equipment_profile: 'full_gym' }, ['Strength / Muscular Endurance'], false);
    expect(filtered).toHaveLength(14);
    expect(filtered.map((w) => w.id)).toContain('x');
  });
});
