// Logging helpers shared by the Edge Functions.
//
// The rule: log enough to diagnose a failure, never enough to reconstruct
// what the user was doing. Gemini echoes parts of the request back in its
// error messages, and Postgres puts row values in `details` — so dumping
// either verbatim would write someone's income, spending and merchant names
// into Supabase logs, which is a privacy problem rather than an ops one.

/**
 * Logs why an AI provider call failed, keeping only the HTTP status and the
 * provider's own error enum. That pair is what actually distinguishes a quota
 * problem from a malformed request; the message body adds nothing but risk.
 */
export async function logProviderError(where: string, res: Response) {
  let code = "unknown";
  try {
    const body = await res.json();
    code = body?.error?.status ?? body?.error?.code ?? "unknown";
  } catch {
    // Non-JSON error body — the status alone will have to do.
  }
  console.error(`[${where}] provider error http=${res.status} code=${code}`);
}

/**
 * Logs a database failure by its Postgres error code only. `message` and
 * `details` routinely quote the offending row, so neither is safe to keep.
 */
export function logDbError(where: string, error: { code?: string } | null) {
  console.error(`[${where}] db error code=${error?.code ?? "unknown"}`);
}

/**
 * Logs an unexpected exception by name and message. Messages we throw
 * ourselves are fixed strings; anything from a library is truncated so a
 * verbose error can't smuggle a payload into the log.
 */
export function logUnexpected(where: string, e: unknown) {
  const name = e instanceof Error ? e.name : typeof e;
  const message = e instanceof Error ? e.message.slice(0, 200) : "";
  console.error(`[${where}] unexpected ${name}: ${message}`);
}
