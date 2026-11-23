// Kapy's HTTP handler: who may call, how much, and what happens next.
//
// Everything the outside world supplies (the Auth server, the model, a
// database client, the clock) arrives through `KapyDeps`, so every branch — a
// missing token, an exhausted quota, a model that times out — is tested without
// a network. index.ts wires the real implementations.
//
// Request path, in order:
//   OPTIONS / method  ->  authenticate (Auth server, never just verify_jwt)
//   ->  server configured?  ->  body size and shape  ->  route by `action`
//   ->  quota  ->  work  ->  response + one metrics line
//
// Actions
//   chat (default)        run a conversation turn; may return a transaction PROPOSAL
//   confirm_transaction   save a proposal the person confirmed (the only write)
//
// Compatibility: an app build from before Phase 2 sends no `protocol` and cannot
// show a confirmation card. It still gets answers from real data, but recording
// is withheld (it is told to update) rather than done without confirmation.

import { authenticate, type GetUser } from "../_shared/auth.ts";
import { confirmTransaction } from "../_shared/kapy/actions.ts";
import { parseContext } from "../_shared/kapy/context.ts";
import { ModelError, type Content, type ModelTurn } from "../_shared/kapy/gemini.ts";
import { conversationLanguage } from "../_shared/kapy/language.ts";
import { prepareHistory, runChat, LIMITS } from "../_shared/kapy/orchestrator.ts";
import { consumeQuota, limitsFromEnv, type QuotaKind } from "../_shared/kapy/ratelimit.ts";
import { blockedText, rateLimitedText, unavailableText, type Style } from "../_shared/kapy/render.ts";
import { makeSupabaseStore, type SupabaseLike } from "../_shared/kapy/store.ts";
import { emit, newMetrics, type Logger, type RequestMetrics } from "../_shared/kapy/telemetry.ts";
import { corsHeaders, errorResponse, json, readTextLimited } from "../_shared/http.ts";

export const MAX_BODY_BYTES = 64 * 1024;
const RAW_HISTORY_CAP = 60;

/** A database client bound to the caller's own token: Row Level Security applies to it. */
export type UserClient = SupabaseLike & {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export interface KapyDeps {
  getUser: GetUser;
  geminiApiKey: string | undefined;
  clientFor: (jwt: string) => UserClient;
  callModel: (
    req: { system: string; contents: Content[]; tools: unknown[] },
    deadline: number
  ) => Promise<ModelTurn>;
  now: () => number;
  uuid: () => string;
  env: (key: string) => string | undefined;
  log: Logger;
}

const style = (s: string): Style => (s === "ms" || s === "manglish" ? s : "en");

async function quota(deps: KapyDeps, client: UserClient, kind: QuotaKind) {
  return consumeQuota(client, kind, limitsFromEnv(kind, deps.env));
}

export async function handleKapy(req: Request, deps: KapyDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed.", "method_not_allowed", { Allow: "POST, OPTIONS" });
  }

  // 1. Who is calling? Confirmed by the Auth server; `verify_jwt` alone accepts the anon key.
  const auth = await authenticate(req, deps.getUser);
  if (!auth.ok) {
    emit(deps.log, { evt: "kapy.auth_failed", status: auth.response.status });
    return auth.response;
  }
  const user = auth.user;

  // 2. The request itself.
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    return errorResponse(415, "Send the request as JSON.", "unsupported_media_type");
  }
  const raw = await readTextLimited(req, MAX_BODY_BYTES);
  if (!raw.ok) {
    return raw.reason === "too_large"
      ? errorResponse(413, "That message is too long.", "payload_too_large")
      : errorResponse(400, "Invalid request body.", "invalid_body");
  }
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw.text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse(400, "Invalid request body.", "invalid_body");
  }

  const action = body.action === undefined ? "chat" : body.action;
  if (action !== "chat" && action !== "confirm_transaction") {
    return errorResponse(400, "Unknown request.", "unknown_action");
  }

  // The database client carries the caller's token, so RLS decides what it can see or write.
  const client = deps.clientFor(auth.token);

  // ── confirm_transaction ─────────────────────────────────────
  if (action === "confirm_transaction") {
    const q = await quota(deps, client, "kapy_confirm");
    if (!q.allowed) return quotaResponse(deps, q, "en");

    const r = await confirmTransaction(client, user.id, body.proposal, deps.now());
    emit(deps.log, { evt: "kapy.confirm", status: r.status, ...(("code" in r && r.code) ? { code: r.code } : {}) });

    switch (r.status) {
      case "recorded":
      case "already_recorded":
        return json({ status: r.status, transaction: r.transaction });
      case "invalid":
        return errorResponse(400, "That transaction couldn't be read. Please try again.", "invalid_transaction");
      case "rejected":
        return r.reason === "forbidden"
          ? errorResponse(403, "That isn't allowed.", "forbidden")
          : errorResponse(422, "That transaction isn't allowed. Check the amount, category and date.", "rejected");
      case "failed":
        return errorResponse(503, "Saving isn't available right now. Please try again in a moment.", "unavailable");
    }
  }

  // ── chat ────────────────────────────────────────────────────
  const protocol: 1 | 2 = body.protocol === 2 ? 2 : 1;
  const metrics = newMetrics(protocol);

  const history = prepareHistory(Array.isArray(body.history) ? body.history.slice(-RAW_HISTORY_CAP) : null);
  if (!history.ok) {
    return errorResponse(400, history.reason === "no_user_message" ? "No message to reply to." : "Invalid request body.", history.reason === "no_user_message" ? "no_message" : "invalid_body");
  }
  const replyStyle = style(conversationLanguage(history.messages.filter((m) => m.role === "user").map((m) => m.text)));

  if (!deps.geminiApiKey) {
    // Which secret is missing is for the logs, not for the caller.
    deps.log(JSON.stringify({ evt: "kapy.not_configured" }));
    return errorResponse(503, "Kapy isn't available right now. Try again later.", "not_configured");
  }

  const q = await quota(deps, client, "kapy");
  if (q.allowed && q.unavailable) emit(deps.log, { evt: "kapy.quota_unavailable", kind: "kapy" });
  if (!q.allowed) {
    metrics.outcome = "rate_limited";
    emit(deps.log, metrics);
    return quotaResponse(deps, q, replyStyle);
  }

  const context = parseContext(body.context, deps.now());

  try {
    const out = await runChat(
      { history: history.messages, context },
      {
        callModel: deps.callModel,
        store: makeSupabaseStore(client, user.id),
        now: deps.now,
        uuid: deps.uuid,
        allowProposals: protocol === 2,
        limits: LIMITS,
      },
      metrics
    );
    metrics.quotaUnavailable = q.allowed && q.unavailable;
    emit(deps.log, metrics);
    return json({ reply: out.reply, context: out.context, proposal: out.proposal, protocol: 2 });
  } catch (e) {
    return modelFailure(deps, metrics, e, replyStyle, context);
  }
}

function quotaResponse(deps: KapyDeps, q: Exclude<Awaited<ReturnType<typeof consumeQuota>>, { allowed: true }>, s: Style): Response {
  if (q.reason === "limit") {
    emit(deps.log, { evt: "kapy.rate_limited", window: q.window });
    return json(
      { error: rateLimitedText(s, q.window), code: "rate_limited", retryAfterSec: q.retryAfterSec },
      429,
      { "Retry-After": String(q.retryAfterSec) }
    );
  }
  // The quota service itself failed: refuse rather than run unmetered.
  emit(deps.log, { evt: "kapy.rate_limited", window: "error" });
  return errorResponse(503, unavailableText(s), "quota_unavailable", { "Retry-After": String(q.retryAfterSec) });
}

function modelFailure(
  deps: KapyDeps,
  metrics: RequestMetrics,
  e: unknown,
  s: Style,
  context: ReturnType<typeof parseContext>
): Response {
  if (e instanceof ModelError) {
    metrics.ms.total = metrics.ms.total || 0;
    switch (e.kind) {
      case "timeout":
        metrics.outcome = "model_timeout";
        emit(deps.log, metrics);
        return errorResponse(504, "Kapy took too long to answer. Please try again.", "model_timeout");
      case "blocked":
        // Not an error the person caused or can fix: answer politely, with 200.
        metrics.outcome = "model_blocked";
        emit(deps.log, metrics);
        return json({ reply: blockedText(s), context, proposal: null, protocol: 2 });
      case "rate_limited":
      case "unavailable":
        metrics.outcome = "model_error";
        emit(deps.log, metrics);
        return errorResponse(503, unavailableText(s), "model_unavailable", { "Retry-After": "5" });
      case "auth":
        // A bad or revoked API key: a configuration problem, not the caller's.
        metrics.outcome = "model_error";
        emit(deps.log, metrics);
        deps.log(JSON.stringify({ evt: "kapy.provider_auth_failed" }));
        return errorResponse(503, "Kapy isn't available right now. Try again later.", "not_configured");
      default:
        metrics.outcome = "model_error";
        emit(deps.log, metrics);
        return errorResponse(502, "Kapy couldn't reply right now. Try again.", "model_failed");
    }
  }
  metrics.outcome = "model_error";
  emit(deps.log, metrics);
  // Name only: a message can quote data.
  deps.log(JSON.stringify({ evt: "kapy.unexpected", kind: e instanceof Error ? e.name.slice(0, 30) : "unknown" }));
  return errorResponse(500, "Kapy couldn't reply right now. Try again.", "internal_error");
}
