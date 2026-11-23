// Explicit caller authentication for Edge Functions.
//
// Why this exists: Supabase's `verify_jwt` setting only checks that a token is
// a validly signed JWT. The project's anon key is one — it ships inside every
// copy of the app by design — so with `verify_jwt` as the only gate, anyone who
// extracts that key can call a function without ever signing in. A token also
// stays signature-valid after its user has been deleted, until it expires.
//
// `auth.getUser(token)` asks the Auth server, which rejects the anon key (it
// has no user), expired and revoked tokens, and deleted accounts. Functions
// therefore authenticate here themselves and treat `verify_jwt` as a second
// layer, never the only one.
//
// Written against an injected `getUser` so the logic is testable without a
// network; the real wiring lives in supabase-auth.ts.

import { errorResponse } from "./http.ts";

export type AuthenticatedUser = { id: string; is_anonymous?: boolean };

export type GetUserResult = {
  user: AuthenticatedUser | null;
  // Whatever the Auth client returned. Only `status` and `name` are inspected.
  error: unknown;
};

export type GetUser = (jwt: string) => Promise<GetUserResult>;

export type AuthResult =
  | { ok: true; user: AuthenticatedUser; token: string }
  | { ok: false; response: Response };

// A signed access token is a few hundred bytes. Anything far beyond that is not
// one, and is not worth a round trip to the Auth server.
const MAX_TOKEN_LENGTH = 4096;
const JWT_SHAPE = /^[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}$/;

/**
 * Pulls the token out of `Authorization: Bearer <jwt>`, or null if the header
 * is absent or does not have that exact shape.
 */
export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer +([^ ]+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (token.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(token)) return null;
  return token;
}

const UNAUTHORIZED = "Please log in to continue.";

function unauthorized(code: string): AuthResult {
  return {
    ok: false,
    response: errorResponse(401, UNAUTHORIZED, code, {
      "WWW-Authenticate": 'Bearer realm="tabara"',
    }),
  };
}

/** True when the failure says the Auth service could not be reached. */
function isServiceFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; name?: unknown };
  if (e.name === "AuthRetryableFetchError") return true;
  return typeof e.status === "number" && (e.status === 0 || e.status >= 500);
}

/**
 * Authenticates the request. Fails closed: anything other than a confirmed,
 * non-anonymous user is a rejection.
 *
 * 401 — no token, a malformed token, or one the Auth server rejects
 * 403 — a real but anonymous session (the app has no guest mode)
 * 503 — the Auth service could not be reached, so identity cannot be confirmed
 */
export async function authenticate(
  req: Request,
  getUser: GetUser
): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  if (!header) return unauthorized("missing_token");

  const token = extractBearerToken(header);
  if (!token) return unauthorized("malformed_token");

  let result: GetUserResult;
  try {
    result = await getUser(token);
  } catch {
    return {
      ok: false,
      response: errorResponse(
        503,
        "We couldn't verify your session right now. Try again in a moment.",
        "auth_unavailable"
      ),
    };
  }

  if (result.error || !result.user || typeof result.user.id !== "string" || !result.user.id) {
    if (isServiceFailure(result.error)) {
      return {
        ok: false,
        response: errorResponse(
          503,
          "We couldn't verify your session right now. Try again in a moment.",
          "auth_unavailable"
        ),
      };
    }
    return unauthorized("invalid_token");
  }

  if (result.user.is_anonymous === true) {
    return {
      ok: false,
      response: errorResponse(
        403,
        "Please sign in with an account to use this.",
        "anonymous_not_allowed"
      ),
    };
  }

  return { ok: true, user: result.user, token };
}
