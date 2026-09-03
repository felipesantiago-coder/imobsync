import { createBrowserClient } from "@supabase/ssr";

// Singleton browser client (audit P1.2): one instance per module execution.
// Previously every call created a new createBrowserClient(), duplicating
// GoTrue listeners, auth state work and realtime connection bookkeeping.
// Server-side clients are unaffected (see ./server.ts, per-request).
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
