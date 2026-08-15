// Permanently deletes the calling user's account.
//
// This has to be a server function because removing an auth user requires the
// service_role key, which must never ship inside the app — anyone could pull
// it out of the APK and delete arbitrary accounts.
//
// The identity being deleted comes from the caller's JWT and nothing else.
// There is deliberately no user id in the request body: accepting one would
// mean any signed-in user could delete anybody else's account by changing a
// value, which is the single most dangerous mistake this endpoint could make.
//
// profiles.id and transactions.user_id both reference auth.users with
// ON DELETE CASCADE, so removing the auth user removes every row belonging to
// them. That is enforced by the database rather than by this code, so it also
// holds for deletions performed from the Supabase dashboard.
//
// Deploy:
//   npx supabase functions deploy delete-account

import { createClient } from "npm:@supabase/supabase-js@2";
import { logDbError, logUnexpected } from "../_shared/log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Not signed in." }, 401);
  }

  try {
    // Establish who is calling, using their own token and the anon key. This
    // client has no elevated rights — it can only confirm the token is valid
    // and whose it is.
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await asUser.auth.getUser();

    if (authError || !user) {
      return json({ error: "Not signed in." }, 401);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      // Misconfiguration, not the user's problem — don't leave them believing
      // their account was deleted when nothing happened.
      logUnexpected("delete-account", new Error("service role key missing"));
      return json({ error: "Account deletion isn't available right now." }, 500);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // One call, and the cascade takes the profile and transactions with it.
    // Deleting the rows separately first would risk emptying someone's account
    // and then failing to remove it, which is worse than failing outright.
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
      logDbError("delete-account", error);
      return json({ error: "Couldn't delete the account. Try again." }, 500);
    }

    return json({ success: true });
  } catch (e) {
    logUnexpected("delete-account", e);
    return json({ error: "Couldn't delete the account. Try again." }, 500);
  }
});
