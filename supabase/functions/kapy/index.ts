// Kapy — the AI money buddy.
//
// This file only connects the handler to the real world: the Auth server, a
// database client bound to the caller's token, Gemini, and the clock. The
// behaviour lives in ./handler.ts and ../_shared/kapy/, where it is tested.
//
// Architecture (see docs/TABARA_2.0_PHASE2_KAPY_REPORT.md):
//   handler       auth, limits, routing, quota, error mapping
//   orchestrator  the turn: tools, bounds, reply checks
//   tools         what the model may ask for, strictly validated
//   executor      runs a tool against the caller's own data
//   finance       every number, deterministic, in whole sen
//   store         reads under Row Level Security, paginated
//   grounding     verifies the reply's figures against the tool results
//   actions       the only write, after the person confirms
//
// The Gemini key stays on the server. The caller's token is used for every
// database read and write, so Row Level Security — not this code — decides what
// any query can touch.
//
// Deploy (apply the migrations first):
//   npx supabase secrets set GEMINI_API_KEY=...
//   npx supabase functions deploy kapy

import { createClient } from "npm:@supabase/supabase-js@2";
import { callGemini } from "../_shared/kapy/gemini.ts";
import { makeGetUser } from "../_shared/supabase-auth.ts";
import { handleKapy, type UserClient } from "./handler.ts";

// Pinned, not `gemini-flash-latest`: an alias re-points whenever Google ships a
// new generation, changing tone, output shape, latency and price with no deploy
// on our side. Override with a GEMINI_MODEL secret to switch without a code change.
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.7-flash";

const getUser = makeGetUser();

Deno.serve((req: Request) => {
  // Read per request, so rotating the secret needs no redeploy of this file.
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || undefined;

  return handleKapy(req, {
    getUser,
    geminiApiKey,
    clientFor: (jwt) =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) as unknown as UserClient,
    callModel: (request, deadline) =>
      callGemini({ apiKey: geminiApiKey ?? "", model: MODEL }, request, { fetch, deadline }),
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    env: (key) => Deno.env.get(key),
    log: (line) => console.log(line),
  });
});
