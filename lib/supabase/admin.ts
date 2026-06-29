import { createClient } from "@supabase/supabase-js";

// ⚠️ SOLO en el servidor (Server Actions / Route Handlers).
// Usa la SERVICE ROLE KEY: omite RLS. Nunca la importes en código de cliente
// ni la expongas con el prefijo NEXT_PUBLIC_.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
