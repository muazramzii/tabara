// Parsing and checking the URL a sign-in provider sends the browser back to.
//
// Split from oauth.ts (which needs the React Native runtime) so that it can be
// tested. These are the checks standing between "a URL arrived" and "log this
// person in".

/**
 * Compares the URL we were returned to with the one we asked for, ignoring only
 * the query string, fragment, trailing slash and the case of the scheme.
 *
 * Needed because on Android expo-web-browser accepts any URL that merely
 * *starts with* the redirect URL, so `tabara://auth-callback.evil/x` would pass
 * its check.
 */
export function matchesRedirect(url: string, expected: string): boolean {
  const base = (u: string) =>
    u
      .split("#")[0]
      .split("?")[0]
      .replace(/\/+$/, "")
      .replace(/^[A-Za-z][A-Za-z0-9+.-]*:/, (scheme) => scheme.toLowerCase());
  return base(url) === base(expected);
}

export type CallbackParams = {
  /** The one-time authorisation code (PKCE). */
  code: string | null;
  /** Present only on the legacy implicit flow. Never trusted — see oauth.ts. */
  hasTokens: boolean;
  /** The provider's error code, e.g. "access_denied". Free text is deliberately not kept. */
  error: string | null;
};

// Auth codes are opaque but plain: no spaces, no markup. Bounded so a junk or
// hostile value is refused before it is sent to the Auth server.
const CODE_SHAPE = /^[A-Za-z0-9._~-]{8,512}$/;

/** Reads what the provider redirected back with. Never returns token values. */
export function parseAuthCallback(url: string): CallbackParams {
  const hash = url.indexOf("#");
  const fragment = hash >= 0 ? url.slice(hash + 1) : "";
  const beforeHash = hash >= 0 ? url.slice(0, hash) : url;
  const q = beforeHash.indexOf("?");
  const query = q >= 0 ? beforeHash.slice(q + 1) : "";

  const params = new URLSearchParams(query);
  for (const [key, value] of new URLSearchParams(fragment)) {
    if (!params.has(key)) params.set(key, value);
  }

  const rawCode = params.get("code");
  const rawError = params.get("error");
  return {
    code: rawCode && CODE_SHAPE.test(rawCode) ? rawCode : null,
    hasTokens: params.has("access_token") || params.has("refresh_token"),
    error: rawError ? rawError.slice(0, 64) : null,
  };
}

/** Errors that just mean the person said no, rather than something broke. */
export function isUserCancellation(error: string | null): boolean {
  return error === "access_denied";
}
