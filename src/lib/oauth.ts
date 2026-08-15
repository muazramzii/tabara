import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

// Social sign-in via the system browser.
//
// The browser flow rather than a native SDK, deliberately: native Google
// Sign-In needs a custom development build and stops working in Expo Go
// entirely. This runs anywhere, including the emulator, at the cost of a
// browser tab appearing briefly.
//
// No client secret lives in the app. The app only opens a Supabase-generated
// URL; Supabase holds the provider credentials and does the token exchange.

export type OAuthProvider = "google" | "facebook";

export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Google",
  facebook: "Facebook",
};

// Extra parameters handed to the provider's authorisation page.
const PROVIDER_PARAMS: Partial<Record<OAuthProvider, Record<string, string>>> = {
  // Without this, Google skips its account chooser whenever exactly one
  // account is signed into the browser — so tapping "Google" silently signs
  // you in as whoever that happens to be, with no way to pick someone else.
  // Forcing the prompt also exposes the "Use another account" option.
  google: { prompt: "select_account" },
};

/** Where the provider sends the user back to. Must be allow-listed in Supabase. */
export function redirectUrl() {
  // In Expo Go this is exp://…/--/auth-callback; in a release build it is
  // tabara://auth-callback. Both have to be listed under
  // Authentication → URL Configuration → Redirect URLs.
  return Linking.createURL("auth-callback");
}

/** Pull the session tokens out of whatever the provider redirected us back with. */
function parseAuthParams(url: string) {
  // Tokens arrive in the fragment (#access_token=…) on the implicit flow and
  // as ?code=… on PKCE. Handle both so this keeps working if the client's
  // flowType is ever changed.
  const [, fragment] = url.split("#");
  const query = url.split("?")[1]?.split("#")[0];

  const params = new URLSearchParams(fragment ?? query ?? "");
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    code: params.get("code"),
    error: params.get("error_description") ?? params.get("error"),
  };
}

export type OAuthResult =
  | { ok: true }
  | { ok: false; cancelled?: boolean; message?: string };

/**
 * Opens the provider's login page and, on success, stores the session.
 *
 * Returns rather than throwing so the caller can tell a genuine failure from
 * the user simply backing out of the browser — those deserve different
 * treatment, and an alert for "changed my mind" is just noise.
 */
export async function signInWithProvider(
  provider: OAuthProvider
): Promise<OAuthResult> {
  const redirectTo = redirectUrl();

  // The single most common cause of a sign-in that opens the browser and then
  // silently does nothing is this URL not being in Supabase's allow-list. It
  // is otherwise invisible, so print it while developing.
  if (__DEV__) console.log("[oauth] redirect URL:", redirectTo);

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // We open the browser ourselves so we can await the result; letting
        // the client redirect would hand control away and never come back.
        skipBrowserRedirect: true,
        queryParams: PROVIDER_PARAMS[provider],
      },
    });

    if (error) {
      // The commonest cause by far is the provider not being switched on in
      // the Supabase dashboard, so say that rather than echoing a raw error.
      return {
        ok: false,
        message: `${PROVIDER_LABEL[provider]} sign-in isn't set up yet. Enable it in Supabase → Authentication → Providers.`,
      };
    }
    if (!data?.url) {
      return { ok: false, message: "Couldn't start sign-in. Try again." };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== "success") {
      // "cancel" and "dismiss" both mean the user closed the browser.
      return { ok: false, cancelled: true };
    }

    const { accessToken, refreshToken, code, error: authError } =
      parseAuthParams(result.url);

    if (authError) return { ok: false, message: authError };

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) return { ok: false, message: sessionError.message };
      return { ok: true };
    }

    if (code) {
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) return { ok: false, message: exchangeError.message };
      return { ok: true };
    }

    return { ok: false, message: "Sign-in didn't complete. Try again." };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Something went wrong." };
  }
}
