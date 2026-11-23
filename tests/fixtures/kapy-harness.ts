// Shared scaffolding for the Kapy behaviour and security tests.
//
//   scriptedModel   a model whose every reply is written by the test, so that
//                   "what if the model invents a number / claims it saved / calls
//                   fifty tools / goes silent" can each be exercised exactly
//   fakeAuth        the Auth server: knows which tokens belong to whom
//   makeHandlerDeps the whole handler's dependencies, with RLS-faithful data
//
// What this does and does NOT test: it tests everything the server does AROUND
// the model — validation, tool execution, bounds, verification, authorisation.
// It cannot test how well Gemini itself understands a sentence or chooses a tool;
// that needs the real model (see evals/kapy/README.md).

import type { GetUser } from "../../supabase/functions/_shared/auth";
import type { Content, ModelTurn, Part } from "../../supabase/functions/_shared/kapy/gemini";
import type { KapyDeps, UserClient } from "../../supabase/functions/kapy/handler";
import { LEDGER_ROWS, NOW, PROFILE_ROW } from "./kapy-ledger";
import { makeFakeSupabase, uuid, type FakeDb, type FakeOptions, type FakeRow } from "./fake-supabase";

export const ALICE = uuid(101);
export const BOB = uuid(102);

export const tokenFor = (name: string) => `eyJhbGci.${name.replace(/[^A-Za-z0-9_-]/g, "x").padEnd(6, "x")}.sig${name.length}abc`;
export const ALICE_TOKEN = tokenFor("alice-token");
export const BOB_TOKEN = tokenFor("bob-token");

// ── a scripted model ────────────────────────────────────────

const usage = { promptTokens: 120, outputTokens: 30, totalTokens: 150 };

export const say = (text: string): ModelTurn => ({
  content: { role: "model", parts: [{ text }] },
  usage,
  finishReason: "STOP",
});

export const callTools = (...calls: { name: string; args?: unknown }[]): ModelTurn => ({
  content: { role: "model", parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args ?? {} } })) },
  usage,
  finishReason: "STOP",
});

export type Step = ModelTurn | Error | ((req: { system: string; contents: Content[]; tools: unknown[] }) => ModelTurn | Error);

/**
 * A model that plays back `steps` in order. Records every request it receives.
 * Running past the end of the script is a test bug and fails loudly.
 */
export function scriptedModel(steps: Step[]) {
  const requests: { system: string; contents: Content[]; tools: unknown[] }[] = [];
  let i = 0;
  const callModel = async (req: { system: string; contents: Content[]; tools: unknown[] }) => {
    requests.push({ system: req.system, contents: structuredClone(req.contents), tools: req.tools });
    if (i >= steps.length) throw new Error(`scripted model: no step left for call #${i + 1}`);
    const step = steps[i++];
    const out = typeof step === "function" ? step(req) : step;
    if (out instanceof Error) throw out;
    return out;
  };
  return { callModel, requests, get calls() { return i; } };
}

/** The function responses the model was given in a request, as parsed objects. */
export function toolResponses(contents: Content[]): { name: string; response: Record<string, unknown> }[] {
  return contents
    .flatMap((c) => c.parts)
    .filter((p: Part) => p.functionResponse)
    .map((p) => p.functionResponse as { name: string; response: Record<string, unknown> });
}

// ── data, auth, quota ───────────────────────────────────────

export function ledgerDb(extra: FakeRow[] = []): FakeDb {
  const mine: FakeRow[] = LEDGER_ROWS.map((r) => ({ ...r, user_id: ALICE }));
  // Bob has a very different, very large ledger: if any of it ever shows up in
  // Alice's answers, isolation has failed.
  const bobs: FakeRow[] = [
    { id: "bob-1", user_id: BOB, amount: 987654.32, type: "expense", category: "shopping", date: "2026-11-05T04:00:00Z", note: "BOB-SECRET-PURCHASE" },
    { id: "bob-2", user_id: BOB, amount: 555555.55, type: "income", category: "salary", date: "2026-11-06T04:00:00Z", note: null },
  ];
  return {
    transactions: [...mine, ...bobs, ...extra],
    profiles: [
      { id: ALICE, ...PROFILE_ROW },
      { id: BOB, income: 777777, savings_goal: 1, budgets: {} },
    ],
  };
}

export const fakeAuth: GetUser = async (jwt) => {
  if (jwt === ALICE_TOKEN) return { user: { id: ALICE }, error: null };
  if (jwt === BOB_TOKEN) return { user: { id: BOB }, error: null };
  return { user: null, error: { name: "AuthApiError", status: 401, message: "invalid claim: missing sub claim" } };
};

export interface QuotaScript {
  /** Per call: what the ai_consume RPC answers. Default: always allowed. */
  respond?: (kind: string, windowSeconds: number, max: number, offset: number) => { data?: unknown; error?: unknown };
}

export function makeRpc(script: QuotaScript = {}, record: { args: Record<string, unknown>[] } = { args: [] }) {
  return (fn: string, args: Record<string, unknown>) => {
    record.args.push({ fn, ...args });
    const r = script.respond?.(String(args.p_kind), Number(args.p_window_seconds), Number(args.p_max), Number(args.p_offset_seconds));
    return Promise.resolve(r ?? { data: { allowed: true, uses: 1, retry_after_seconds: 0 }, error: null });
  };
}

export interface HarnessOptions {
  db?: FakeDb;
  steps?: Step[];
  quota?: QuotaScript;
  geminiApiKey?: string | undefined;
  fake?: Partial<FakeOptions>;
  getUser?: GetUser;
  env?: Record<string, string>;
  now?: number;
}

export function makeHandlerDeps(o: HarnessOptions = {}) {
  const db = o.db ?? ledgerDb();
  const model = scriptedModel(o.steps ?? []);
  const logs: string[] = [];
  const rpcCalls: { args: Record<string, unknown>[] } = { args: [] };
  const clients: { user: string }[] = [];
  let nextUuid = 1;

  const deps: KapyDeps = {
    getUser: o.getUser ?? fakeAuth,
    geminiApiKey: "geminiApiKey" in o ? o.geminiApiKey : "test-key-not-real",
    clientFor: (jwt) => {
      const user = jwt === ALICE_TOKEN ? ALICE : jwt === BOB_TOKEN ? BOB : "nobody";
      clients.push({ user });
      const fake = makeFakeSupabase(db, { authUser: user, ...o.fake });
      return { ...fake.client, rpc: makeRpc(o.quota, rpcCalls) } as unknown as UserClient;
    },
    callModel: model.callModel,
    now: () => o.now ?? NOW,
    uuid: () => uuid(9000 + nextUuid++).replace(/^00000000-0000-4000-8000-/, "cafe0000-0000-4000-8000-"),
    env: (k) => o.env?.[k],
    log: (line) => logs.push(line),
  };
  return { deps, db, model, logs, rpcCalls, clients };
}

export function chatRequest(
  body: Record<string, unknown>,
  token: string | null = ALICE_TOKEN,
  extraHeaders: Record<string, string> = {}
): Request {
  const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://example.test/functions/v1/kapy", { method: "POST", headers, body: JSON.stringify(body) });
}

export const userSays = (text: string) => ({ history: [{ role: "user", text }], protocol: 2 });
