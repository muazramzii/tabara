// One Kapy conversation turn, from the user's message to a checked reply.
//
// The loop
// --------
//   1. Read the message (language, intent, period, category) and resolve what
//      "that" / "last month" refer to from the remembered context.
//   2. Ask the model, with tools. While it asks for tools, run them — each
//      validated, each against the caller's own data — and give it the results.
//   3. When it answers in words, CHECK the words before they reach anyone:
//        - a transaction is proposed? Replace the prose with server-written
//          text; the model's own wording is not used (it could claim "saved").
//        - it claims something was recorded? That is false by construction.
//        - it states a figure no tool returned? Ask once for a correction, then
//          answer from the tool results ourselves.
//   4. Return the reply, the proposal (if any) and the context to remember.
//
// Bounds (all enforced here, all tested): rounds, tool calls per round and in
// total, history length, per-message length, a wall-clock deadline, and a
// per-tool timeout. A model that loops, floods tool calls or stalls costs a
// bounded amount and ends in a sensible reply, not an open-ended bill.
//
// The model client, the store and the clock are injected, so every branch — a
// lying model, a tool timeout, a database failure — is exercised in tests
// without Gemini or Supabase.

import type { Proposal } from "./actions.ts";
import {
  nextContext,
  resolveReferences,
  type KapyContext,
} from "./context.ts";
import { executeTool, type ToolOutcome } from "./executor.ts";
import { checkGrounding, claimsRecorded, collectTruth, type Truth } from "./grounding.ts";
import type { Content, ModelTurn, Part } from "./gemini.ts";
import { analyzeMessage } from "./intent.ts";
import { conversationLanguage } from "./language.ts";
import { buildSystemPrompt } from "./prompt.ts";
import {
  clarifyText,
  fallbackFromResults,
  noDataText,
  notSavedText,
  previewText,
  tangledText,
  type Style,
} from "./render.ts";
import type { FinanceStore } from "./store.ts";
import { recordTool, type RequestMetrics } from "./telemetry.ts";
import { toolDeclarations, validateToolCall } from "./tools.ts";

export interface Limits {
  maxRounds: number;
  maxToolCallsPerRound: number;
  maxToolCallsTotal: number;
  maxHistoryMessages: number;
  maxCharsPerMessage: number;
  maxHistoryChars: number;
  /** How many times a flawed reply may be sent back for correction. */
  maxRepairs: number;
  deadlineMs: number;
  toolTimeoutMs: number;
}

export const LIMITS: Limits = {
  maxRounds: 5,
  maxToolCallsPerRound: 3,
  maxToolCallsTotal: 6,
  maxHistoryMessages: 12,
  maxCharsPerMessage: 1500,
  maxHistoryChars: 8000,
  maxRepairs: 1,
  deadlineMs: 45_000,
  toolTimeoutMs: 10_000,
};

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export type HistoryResult = { ok: true; messages: ChatMessage[] } | { ok: false; reason: "no_user_message" | "invalid" };

/** Trims a client-supplied history to something safe to send to the model. */
export function prepareHistory(raw: unknown, limits: Limits = LIMITS): HistoryResult {
  if (!Array.isArray(raw)) return { ok: false, reason: "invalid" };
  const cleaned: ChatMessage[] = [];
  for (const m of raw.slice(-limits.maxHistoryMessages * 2)) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    // Anything that is not clearly the model is the user.
    const role = r.role === "model" ? "model" : "user";
    const text = typeof r.text === "string" ? r.text.slice(0, limits.maxCharsPerMessage).trim() : "";
    if (text) cleaned.push({ role, text });
  }
  let messages = cleaned.slice(-limits.maxHistoryMessages);
  // Newest messages matter most: drop the oldest until the total fits.
  let total = messages.reduce((n, m) => n + m.text.length, 0);
  while (messages.length > 1 && total > limits.maxHistoryChars) {
    total -= messages[0].text.length;
    messages = messages.slice(1);
  }
  // Gemini rejects a conversation that opens on the model's turn.
  while (messages.length && messages[0].role === "model") messages = messages.slice(1);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return { ok: false, reason: "no_user_message" };
  }
  return { ok: true, messages };
}

export interface OrchestratorDeps {
  /** One model call. Retries and per-attempt timeouts live inside; `deadline` bounds the whole turn. */
  callModel: (
    req: { system: string; contents: Content[]; tools: unknown[] },
    deadline: number
  ) => Promise<ModelTurn>;
  store: FinanceStore;
  now: () => number;
  uuid: () => string;
  /** False for an older app without the confirmation card. */
  allowProposals: boolean;
  limits?: Partial<Limits>;
}

export interface ChatResult {
  reply: string;
  proposal: Proposal | null;
  context: KapyContext | null;
}

const timeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("tool_timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

const textOf = (parts: Part[]): string =>
  parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim();

const asStyle = (l: string): Style => (l === "ms" || l === "manglish" ? l : "en");

export async function runChat(
  input: { history: ChatMessage[]; context: KapyContext | null },
  deps: OrchestratorDeps,
  metrics: RequestMetrics
): Promise<ChatResult> {
  const limits: Limits = { ...LIMITS, ...deps.limits };
  const startedAt = deps.now();
  const deadline = startedAt + limits.deadlineMs;
  const finish = (outcome: RequestMetrics["outcome"]) => {
    metrics.outcome = outcome;
    metrics.ms.total = deps.now() - startedAt;
  };

  const userTexts = input.history.filter((m) => m.role === "user").map((m) => m.text);
  const lastUser = userTexts[userTexts.length - 1] ?? "";
  const analysis = analyzeMessage(lastUser, startedAt);
  const style = conversationLanguage(userTexts);
  const resolved = resolveReferences(analysis, input.context);
  const context = nextContext(analysis, resolved, input.context, startedAt);

  metrics.lang = style;
  metrics.intent = resolved.intent;
  metrics.intentConfidence = Math.round(analysis.confidence * 10) / 10;

  // A pointer with nothing behind it: ask, deterministically, without a model call.
  if (resolved.needsClarification) {
    finish("needs_clarification");
    return { reply: clarifyText(resolved.needsClarification, asStyle(style)), proposal: null, context };
  }

  const system = buildSystemPrompt({ now: startedAt, style, analysis, resolved });
  const tools = toolDeclarations(deps.allowProposals);
  const contents: Content[] = input.history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  const truth: Truth = { rm: [], pct: [] };
  const userText = userTexts.slice(-3).join(" ");
  const results: Record<string, unknown>[] = [];
  let proposal: Proposal | null = null;
  let toolTotal = 0;
  let repairs = 0;
  let claimRepairs = 0;
  const style3 = asStyle(style);

  const fallback = (): string => fallbackFromResults(results, style3) ?? (metrics.storeErrors > 0 ? noDataText(style3) : tangledText(style3));

  for (let round = 0; round < limits.maxRounds; round++) {
    metrics.rounds++;
    const t0 = deps.now();
    const turn = await deps.callModel({ system, contents, tools }, deadline);
    metrics.ms.model += deps.now() - t0;
    metrics.modelCalls++;
    metrics.tokens.prompt += turn.usage.promptTokens;
    metrics.tokens.output += turn.usage.outputTokens;
    metrics.tokens.total += turn.usage.totalTokens;

    const parts = turn.content.parts;
    const calls = parts.filter((p) => p.functionCall);

    // ── the model asked for tools ──
    if (calls.length > 0) {
      // Echoed back exactly as received, which the API requires.
      contents.push({ role: "model", parts });
      const responses: Part[] = [];

      for (let i = 0; i < calls.length; i++) {
        const fc = calls[i].functionCall as { name?: unknown; args?: unknown };
        const name = typeof fc.name === "string" ? fc.name : "unknown";
        let outcome: ToolOutcome;

        if (i >= limits.maxToolCallsPerRound || toolTotal >= limits.maxToolCallsTotal) {
          outcome = {
            ok: false,
            result: { ok: false, error: "tool_limit_reached", message: "Too many tool calls this turn. Answer with what you have." },
          };
          metrics.outcome = "tool_budget_exhausted";
        } else {
          toolTotal++;
          const v = validateToolCall(name, fc.args, resolved);
          if (!v.ok) {
            outcome = { ok: false, result: { ok: false, error: v.error, message: "Those arguments were not valid. Fix them or answer without this tool." } };
          } else if (v.call.name === "propose_transaction" && !deps.allowProposals) {
            outcome = { ok: false, result: { ok: false, error: "not_available", message: "Recording is not available in this version of the app. Do not claim anything was recorded; tell them to update the app." } };
          } else {
            const t1 = deps.now();
            try {
              outcome = await timeout(
                executeTool(v.call, { store: deps.store, now: startedAt, uuid: deps.uuid, lang: style3 }),
                limits.toolTimeoutMs
              );
            } catch (e) {
              // A store failure is handled inside executeTool; this is a timeout or a bug.
              // (Counted once, below, through `storeError`.)
              outcome = {
                ok: false,
                storeError: (e as Error).message === "tool_timeout" ? "timeout" : "unexpected",
                result: { ok: false, error: "data_unavailable", message: "The user's data could not be read right now. Say you can't check at the moment. Do not guess any figure." },
              };
            }
            metrics.ms.tools += deps.now() - t1;
          }
        }

        recordTool(metrics, name, outcome.ok);
        if (outcome.storeError) metrics.storeErrors++;
        if (outcome.truncated) metrics.dataTruncated = true;
        if (outcome.proposal) {
          proposal = outcome.proposal; // the latest valid proposal wins; a correction replaces it
          metrics.proposed = true;
        }
        if (outcome.ok) {
          collectTruth(outcome.result, truth);
          results.push(outcome.result);
        }
        responses.push({ functionResponse: { name, response: outcome.result } });
      }

      contents.push({ role: "user", parts: responses });
      continue;
    }

    // ── the model answered in words ──
    const text = textOf(parts);

    if (proposal) {
      // The reply is ours: the model's prose is not used when a card is shown.
      finish("proposal");
      return { reply: previewText(style3), proposal, context };
    }

    if (claimsRecorded(text)) {
      // Nothing can have been saved in this turn, so the claim is false.
      if (claimRepairs < limits.maxRepairs) {
        claimRepairs++;
        metrics.claimRepairs++;
        contents.push({ role: "model", parts });
        contents.push({
          role: "user",
          parts: [{ text: "[system] Nothing has been saved. You cannot save transactions. Rewrite your reply without saying anything was saved or recorded. If the user wants to record something, call propose_transaction so they can confirm it." }],
        });
        continue;
      }
      finish("claim_fallback");
      return { reply: notSavedText(style3), proposal: null, context };
    }

    const g = checkGrounding(text, truth, userText);
    metrics.grounding.checked = true;
    if (!g.ok) {
      metrics.grounding.failures++;
      if (repairs < limits.maxRepairs) {
        repairs++;
        metrics.grounding.repaired = true;
        contents.push({ role: "model", parts });
        contents.push({
          role: "user",
          parts: [{
            text: `[system] Your reply stated figures that no tool returned: ${g.ungrounded.join(", ")}. Rewrite it using only figures that appear in tool results (quote the "formatted" text), calling a tool first if you need one, or say you don't have that figure. Do not do arithmetic.`,
          }],
        });
        continue;
      }
      metrics.grounding.fellBack = true;
      finish("grounding_fallback");
      return { reply: fallback(), proposal: null, context };
    }

    if (!text) {
      finish("rounds_exhausted");
      return { reply: fallback(), proposal: null, context };
    }

    finish(claimRepairs > 0 ? "claim_repaired" : repairs > 0 ? "grounding_repaired" : metrics.outcome === "tool_budget_exhausted" ? "tool_budget_exhausted" : "ok");
    return { reply: text, proposal: null, context };
  }

  // Out of rounds without a final answer.
  if (proposal) {
    finish("proposal");
    return { reply: previewText(style3), proposal, context };
  }
  finish(metrics.outcome === "tool_budget_exhausted" ? "tool_budget_exhausted" : "rounds_exhausted");
  return { reply: fallback(), proposal: null, context };
}

