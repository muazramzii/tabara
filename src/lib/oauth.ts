import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { isUserCancellation, matchesRedirect, parseAuthCallback } from "./oauth-url";
import { supabase } from "./supabase";

// Social sign-in via the system browser.
//
// The browser flow rather than a native SDK, deliberately: native Google
// Sign-In needs a custom development build and stops working in Expo Go
// entirely. This runs anywhere, including the emulator, at the cost of a
// browser tab appearing briefly.
//
// No client secret lives in the app. The app only opens a Supabase-generated
// URL; Supabase holds the provider credentials and does the code exchange.
//
// PKCE (see supabase.ts): the browser is sent back with a one-time `code`, not
// with session tokens. The code is useless without the verifier that this app
// stored before the browser opened, so another app that manages to receive the
// redirect cannot turn it into a session. Consequently this file never accepts
// tokens from a URL: a redirect that carries them is not one we asked for.

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

const DIDNT_COMPLETE = "Sign-in didn't complete. Try again.";

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
      // the Supabase dashboard. That is a hint for whoever is setting the app
      // up, not something to show the public, so it only appears in development.
      return {
        ok: false,
        message: __DEV__
          ? `${PROVIDER_LABEL[provider]} sign-in isn't set up yet. Enable it in Supabase → Authentication → Providers.`
          : `${PROVIDER_LABEL[provider]} sign-in isn't available right now. Try again later.`,
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

    // On Android the browser module treats any URL that *begins with* the
    // redirect URL as ours. Require an exact match before reading anything out
    // of it.
    if (!matchesRedirect(result.url, redirectTo)) {
      if (__DEV__) console.warn("[oauth] ignoring a callback to an unexpected URL");
      return { ok: false, message: DIDNT_COMPLETE };
    }

    const callback = parseAuthCallback(result.url);

    if (callback.error) {
      // Saying no on the provider's page is a choice, not a failure. Anything
      // else is reported generically: the provider's own wording can carry
      // internal detail, and anyone able to open our URL scheme could put text
      // of their choosing in it.
      if (isUserCancellation(callback.error)) return { ok: false, cancelled: true };
      if (__DEV__) console.warn("[oauth] provider returned error:", callback.error);
      return { ok: false, message: DIDNT_COMPLETE };
    }

    // Session tokens in a URL are never accepted. We asked for a code; tokens
    // arriving instead means the URL was not produced by our own request.
    if (callback.hasTokens || !callback.code) {
      if (__DEV__) console.warn("[oauth] callback had no usable authorisation code");
      return { ok: false, message: DIDNT_COMPLETE };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(callback.code);
    if (exchangeError) {
      if (__DEV__) console.warn("[oauth] code exchange failed:", exchangeError.name);
      return { ok: false, message: DIDNT_COMPLETE };
    }
    return { ok: true };
  } catch (e: any) {
    // The message of an unexpected exception is for the log, not for the screen.
    if (__DEV__) console.warn("[oauth] unexpected error:", e?.message);
    return { ok: false, message: "Something went wrong. Try again." };
  }
}
