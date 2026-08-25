import { createClient } from 'npm:@supabase/supabase-js@2';

// Service-role client: bypasses RLS, mirrors Base44's `asServiceRole.entities.*`.
// Only ever use inside Edge Functions (SUPABASE_SERVICE_ROLE_KEY is never exposed
// to the browser) and only after the caller's JWT has been verified via auth.ts.
export function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}
