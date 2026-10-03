import { supabase } from '@/lib/supabaseClient';

// First-touch UTM capture for the Instagram -> trial funnel. The bio link
// carries ?utm_source=instagram&..., which is stored on the first visit and
// handed to the record_attribution RPC once the visitor has an account.
const KEY = 'rz_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

export function captureAttribution() {
  try {
    if (localStorage.getItem(KEY)) return;
    const params = new URLSearchParams(window.location.search);
    if (!UTM_KEYS.some((k) => params.get(k))) return;
    const data = { landing_path: window.location.pathname };
    for (const k of UTM_KEYS) data[k] = params.get(k) || '';
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — attribution is best-effort */
  }
}

export async function flushAttribution() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const { error } = await supabase.rpc('record_attribution', { p: JSON.parse(raw) });
    if (!error) localStorage.removeItem(KEY);
  } catch {
    /* retried on next sign-in */
  }
}
