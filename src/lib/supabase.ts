import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";

// Values live in .env (gitignored). The anon key is safe to ship inside the
// app — it's designed to be public. What actually protects the data is Row
// Level Security: every policy checks auth.uid(), so one user physically
// cannot read another's rows. Never put the service_role key here.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase config. Add EXPO_PUBLIC_SUPABASE_URL and " +
      "EXPO_PUBLIC_SUPABASE_ANON_KEY to .env, then restart with: npx expo start -c"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // keeps users logged in between app reloads
    autoRefreshToken: true,
    persistSession: true,
    // On web the session can come back via a URL fragment; on native it can't.
    detectSessionInUrl: Platform.OS === "web",
    // Authorisation-code flow with PKCE. With the default ("implicit") flow the
    // browser is redirected to tabara://auth-callback#access_token=…, handing
    // live session tokens to whatever app receives that custom-scheme URL. With
    // PKCE it carries only a one-time code that cannot be exchanged without the
    // secret verifier this app saved (in AsyncStorage) before the browser opened.
    //
    // Caveat: PKCE ideally hashes the verifier (S256). React Native has no
    // WebCrypto `crypto.subtle`, so supabase-js falls back to the "plain"
    // method and logs a warning. That is still strictly stronger than implicit —
    // the code is useless without the verifier — but S256 needs a WebCrypto
    // polyfill (a new dependency), which is deliberately left for a reviewed
    // follow-up. Existing stored sessions are unaffected by this setting.
    flowType: "pkce",
  },
});

// Only refresh the access token while the app is in the foreground —
// background timers are unreliable on mobile and waste battery.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export default supabase;
