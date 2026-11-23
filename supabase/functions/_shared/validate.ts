// Input validation shared by the Edge Functions.
//
// Everything a caller sends is untrusted, including values the app's own
// client normally supplies: the app is not the only thing that can reach these
// endpoints.

/** Category ids are short snake_case words, e.g. "food", "income_other". */
const CATEGORY_ID = /^[a-z0-9_]{1,40}$/;
export const MAX_CATEGORIES = 60;

/**
 * Validates a category allow-list sent by the client.
 *
 * It ends up inside a model prompt (receipt scanner) and a tool schema (Kapy),
 * so it is constrained to ids that cannot carry instructions: bounded count,
 * plain strings, a conservative character set. Returns null when invalid.
 */
export function validateCategoryList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0 || raw.length > MAX_CATEGORIES) return null;
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !CATEGORY_ID.test(item)) return null;
    seen.add(item);
  }
  return [...seen];
}

export type SniffedMime = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

const HEIC_BRANDS = new Set([
  "heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1",
]);

/**
 * Identifies an image by its first bytes rather than by what the caller says it
 * is. `base64` must already be normalised (no whitespace, valid alphabet).
 * Returns null for anything that is not a supported photo format.
 */
export function sniffImageMime(base64: string): SniffedMime | null {
  // 48 base64 characters decode to 36 bytes, enough for every signature below.
  const head = base64.slice(0, 48);
  const usable = head.slice(0, head.length - (head.length % 4));
  if (usable.length < 16) return null;

  let bin: string;
  try {
    bin = atob(usable);
  } catch {
    return null;
  }
  const byte = (i: number) => bin.charCodeAt(i);
  const text = (from: number, to: number) => bin.slice(from, to);

  if (byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff) return "image/jpeg";
  if (
    byte(0) === 0x89 && text(1, 4) === "PNG" &&
    byte(4) === 0x0d && byte(5) === 0x0a && byte(6) === 0x1a && byte(7) === 0x0a
  ) {
    return "image/png";
  }
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (text(4, 8) === "ftyp" && HEIC_BRANDS.has(text(8, 12))) return "image/heic";
  return null;
}

const BASE64_ALPHABET = /^[A-Za-z0-9+/]+={0,2}$/;

export type Base64Result =
  | { ok: true; value: string }
  | { ok: false; reason: "missing" | "too_large" | "too_small" | "invalid" };

/**
 * Normalises and checks a base64 payload: removes line breaks some encoders
 * add, enforces the size ceiling, and requires the real base64 alphabet (so a
 * data: URL, a path or arbitrary text is rejected rather than forwarded).
 */
export function validateBase64(
  raw: unknown,
  limits: { max: number; min: number }
): Base64Result {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "missing" };
  // Cheap length gate first, so an oversized string is never copied or scanned.
  if (raw.length > limits.max + 4096) return { ok: false, reason: "too_large" };
  const value = raw.replace(/\s+/g, "");
  if (value.length > limits.max) return { ok: false, reason: "too_large" };
  if (value.length < limits.min) return { ok: false, reason: "too_small" };
  if (!BASE64_ALPHABET.test(value)) return { ok: false, reason: "invalid" };
  return { ok: true, value };
}
