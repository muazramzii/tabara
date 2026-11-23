// HTTP helpers shared by the Edge Functions.
//
// This file deliberately imports nothing Deno-specific, so the same code runs
// under the Node test runner. `Request`, `Response` and `ReadableStream` are
// standard web APIs in both.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      // These responses are per-user; nothing in between should keep a copy.
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

/**
 * Every failure uses the same shape: a message that is safe to show a person,
 * and a short stable `code` the app can branch on. Nothing else — no stack
 * traces, no provider messages, no configuration names.
 */
export function errorResponse(
  status: number,
  message: string,
  code: string,
  extraHeaders: Record<string, string> = {}
): Response {
  return json({ error: message, code }, status, extraHeaders);
}

export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "unreadable" };

/**
 * Reads the request body as text, giving up as soon as it exceeds `maxBytes`.
 *
 * `await req.json()` buffers whatever it is given. A Content-Length header can
 * be absent (chunked uploads) or simply wrong, so the limit is enforced on the
 * bytes actually received rather than on what the client claims.
 */
export async function readTextLimited(
  req: Request,
  maxBytes: number
): Promise<BodyResult> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return { ok: false, reason: "too_large" };
  }

  if (!req.body) return { ok: true, text: "" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }

  try {
    // fatal: a body that is not valid UTF-8 is rejected, not silently repaired.
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(all) };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
