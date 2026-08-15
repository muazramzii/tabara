// Password rules, mirroring what Supabase enforces server-side.
//
// The server is the authority — these checks exist so the user sees what is
// wrong *while typing* instead of getting a rejection after submitting. Never
// treat a pass here as authorisation; Supabase re-validates every signup and
// password change regardless of what the client believes.
//
// Keep this list in step with Auth → Providers → Email → Password Requirements
// in the Supabase dashboard. If they drift, the server wins and the user sees
// an error the checklist said wouldn't happen.

export const MIN_LENGTH = 8;

export type Rule = {
  id: string;
  label: string;
  test: (pw: string) => boolean;
};

export const RULES: Rule[] = [
  {
    id: "length",
    label: `At least ${MIN_LENGTH} characters`,
    test: (pw) => pw.length >= MIN_LENGTH,
  },
  {
    id: "lower",
    label: "One lowercase letter (a–z)",
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: "upper",
    label: "One uppercase letter (A–Z)",
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: "digit",
    label: "One number (0–9)",
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: "symbol",
    // Supabase's own symbol set, spelled out rather than using a negated
    // character class — \W would also accept spaces and accented letters,
    // which the server rejects.
    label: "One symbol (!@#$…)",
    test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(pw),
  },
];

/** Which rules the password currently fails. Empty means it's acceptable. */
export function failedRules(pw: string): Rule[] {
  return RULES.filter((r) => !r.test(pw));
}

export function isValidPassword(pw: string): boolean {
  return failedRules(pw).length === 0;
}

/** 0–1, for a strength bar. Purely how many rules are met. */
export function strength(pw: string): number {
  if (!pw) return 0;
  return RULES.filter((r) => r.test(pw)).length / RULES.length;
}

// ── Username ─────────────────────────────────────────────

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 20;

/**
 * Returns an error message, or null when the name is fine.
 *
 * This is a display name, not an identifier — it's what the app calls you on
 * the home screen. So the rules are about keeping it renderable, not about
 * uniqueness or URL-safety.
 */
export function validateUsername(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < USERNAME_MIN) {
    return `Your name needs at least ${USERNAME_MIN} characters.`;
  }
  if (trimmed.length > USERNAME_MAX) {
    return `Keep it under ${USERNAME_MAX} characters.`;
  }
  // Letters (including non-English ones), digits, spaces, and a few joiners.
  if (!/^[\p{L}\p{N} '._-]+$/u.test(trimmed)) {
    return "Use letters, numbers, spaces, or . _ - only.";
  }
  return null;
}
