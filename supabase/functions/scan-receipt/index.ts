// Receipt scanner — reads a photo of a receipt and pulls out the total,
// merchant, category and date.
//
// Same reason as kapy/: the Gemini key stays on the server.
//
// Authentication happens inside the handler (see _shared/auth.ts) and does not
// depend on the function's `verify_jwt` setting: the anon key is a valid JWT
// and ships in every copy of the app. This file only wires the handler to the
// real Auth server and the real model endpoint.
//
// Deploy:
//   npx supabase functions deploy scan-receipt

import { createClient } from "npm:@supabase/supabase-js@2";
import { consumeQuota, limitsFromEnv } from "../_shared/kapy/ratelimit.ts";
import { makeGetUser } from "../_shared/supabase-auth.ts";
import { handleScanReceipt } from "./handler.ts";

// Pinned rather than `gemini-flash-latest` — see the note in kapy/index.ts.
// Override with a GEMINI_MODEL secret to switch without redeploying code.
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.7-flash";

const getUser = makeGetUser();

Deno.serve((req: Request) => {
  // Read per request so rotating the secret needs no redeploy of this file.
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || undefined;

  return handleScanReceipt(req, {
    getUser,
    geminiApiKey,
    // The per-user allowance is counted in the database with the caller's own
    // token (see ai_consume), so one person cannot spend another's.
    quota: (token) =>
      consumeQuota(
        createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }),
        "scan",
        limitsFromEnv("scan", (k) => Deno.env.get(k))
      ),
    callGemini: (body, signal) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Header auth rather than ?key= so the secret never lands in a URL,
            // where it could show up in logs or proxies.
            "x-goog-api-key": geminiApiKey ?? "",
          },
          body: JSON.stringify(body),
          signal,
        }
      ),
  });
});
