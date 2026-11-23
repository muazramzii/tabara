// Deno wiring for _shared/auth.ts: the real `getUser`, backed by the Auth server.
//
// Imported only by function entry points (index.ts), never by anything the Node
// tests load, because of the `npm:` specifier.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { GetUser } from "./auth.ts";

/**
 * Builds a `getUser` that validates a token against the Auth server.
 *
 * The client uses the anon key and keeps no session: the token under test is
 * passed explicitly, so one client can serve every request without any state
 * leaking from one caller to the next.
 */
export function makeGetUser(): GetUser {
  let client: SupabaseClient | null = null;

  return async (jwt) => {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) {
      // Platform-provided variables missing: identity cannot be confirmed.
      // Reported as a service failure (503), not as the caller's fault.
      return { user: null, error: { name: "ConfigError", status: 503 } };
    }

    client ??= createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await client.auth.getUser(jwt);
    return { user: data?.user ?? null, error };
  };
}
