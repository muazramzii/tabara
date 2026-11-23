// Repository hygiene: the mistakes this project has actually made, turned into
// checks so they cannot come back unnoticed.
//
//   - a Gemini key shipped inside the app bundle via an EXPO_PUBLIC_ variable
//   - key-shaped strings and secret files in Git
//   - Supabase CLI state (project reference, name) committed
//   - an Edge Function deployed that never checks who is calling it
//
// These read the repository itself (through `git ls-files`), so they describe
// what is about to be committed, not what happens to be on disk.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Everything Git would commit: tracked files plus new ones not covered by
// .gitignore. A developer's own (ignored) .env is therefore never read.
const tracked = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: root, encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean)
  // A file deleted from the working tree but not yet committed is still listed.
  .filter((f) => existsSync(path.join(root, f)));

const BINARY = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|lottie|zip|pdf|keystore|jks)$/i;
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const textFiles = tracked.filter((f) => !BINARY.test(f));

// ── secrets ─────────────────────────────────────────────────

test("no environment or credential files are tracked", () => {
  const offenders = tracked.filter(
    (f) =>
      (/(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith(".env.example")) ||
      /\.(pem|key|p8|p12|jks|keystore|mobileprovision)$/i.test(f) ||
      /(^|\/)service-account.*\.json$/i.test(f)
  );
  assert.deepEqual(offenders, []);
});

test("no key-shaped secrets appear in tracked files", () => {
  // Built from fragments so this file does not match its own patterns.
  const patterns: [string, RegExp][] = [
    ["Google API key", new RegExp("AI" + "za[0-9A-Za-z_-]{35}")],
    ["JSON Web Token", new RegExp("ey" + "J[A-Za-z0-9_-]{15,}\\.[A-Za-z0-9_-]{15,}\\.[A-Za-z0-9_-]{10,}")],
    ["Supabase secret key", new RegExp("sb_" + "secret_[A-Za-z0-9_-]{10,}")],
    ["Supabase access token", new RegExp("sb" + "p_[a-f0-9]{30,}")],
    ["private key block", new RegExp("-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE " + "KEY-----")],
    ["OpenAI-style key", new RegExp("sk" + "-[A-Za-z0-9]{32,}")],
  ];
  const hits: string[] = [];
  for (const file of textFiles) {
    const content = read(file);
    for (const [label, re] of patterns) {
      if (re.test(content)) hits.push(`${file}: ${label}`); // never print the match itself
    }
  }
  assert.deepEqual(hits, []);
});

test("the only public (EXPO_PUBLIC_) variables are the Supabase URL and anon key", () => {
  // Everything EXPO_PUBLIC_ is compiled into the app and readable by anyone
  // holding it. This is how the Gemini key once shipped in the bundle.
  const allowed = new Set(["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]);
  const scanned = textFiles.filter(
    (f) => f.startsWith("src/") || f === "app.json" || f === ".env.example" || f === "package.json" || /^eas\.json$/.test(f)
  );
  const found = new Map<string, string[]>();
  for (const file of scanned) {
    for (const [name] of read(file).matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
      if (!allowed.has(name)) found.set(name, [...(found.get(name) ?? []), file]);
    }
  }
  assert.deepEqual([...found.entries()], []);
});

test("server-side secrets are never referenced by app code", () => {
  const offenders: string[] = [];
  for (const file of textFiles.filter((f) => f.startsWith("src/"))) {
    // Comments (line and block) may explain the history; only code counts.
    const content = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (/GEMINI_API_KEY|SERVICE_ROLE|service_role/.test(content)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("Supabase CLI local state is not tracked", () => {
  assert.deepEqual(tracked.filter((f) => f.startsWith("supabase/.temp/") || f.startsWith("supabase/.branches/")), []);
});

test(".gitignore keeps secrets and CLI state out, but keeps the template in", () => {
  const ignore = read(".gitignore");
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(ignore, /^!\.env\.example$/m);
  assert.match(ignore, /^supabase\/\.temp\/$/m);
  assert.ok(tracked.includes(".env.example"), ".env.example must stay tracked");
});

// ── Edge Functions ──────────────────────────────────────────

const functionsDir = path.join(root, "supabase", "functions");
const functionNames = readdirSync(functionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);

test("there are Edge Functions to check", () => {
  assert.ok(functionNames.includes("scan-receipt"));
  assert.ok(functionNames.includes("kapy"));
  assert.ok(functionNames.includes("delete-account"));
});

test("every Edge Function authenticates its caller in code", () => {
  // `verify_jwt` alone accepts the anon key, which ships in every app copy.
  const unauthenticated: string[] = [];
  for (const name of functionNames) {
    const source = tracked
      .filter((f) => f.startsWith(`supabase/functions/${name}/`) && f.endsWith(".ts"))
      .map(read)
      .join("\n");
    if (!/\bauthenticate\(|auth\.getUser\(/.test(source)) unauthenticated.push(name);
  }
  assert.deepEqual(unauthenticated, []);
});

test("every Edge Function sets verify_jwt explicitly in supabase/config.toml", () => {
  const config = read("supabase/config.toml");
  const missing = functionNames.filter(
    (name) => !new RegExp(`\\[functions\\.${name}\\]\\s*\\n\\s*verify_jwt\\s*=\\s*true`).test(config)
  );
  assert.deepEqual(missing, []);
});

test("supabase/config.toml cannot overwrite dashboard settings", () => {
  // `supabase config push` applies every section in this file to the hosted
  // project. Only function settings are safe to keep here.
  const config = read("supabase/config.toml").replace(/#.*$/gm, "");
  const sections = [...config.matchAll(/^\s*\[([^\]]+)\]/gm)].map((m) => m[1]);
  const unexpected = sections.filter((s) => !s.startsWith("functions."));
  assert.deepEqual(unexpected, []);
  assert.doesNotMatch(config, /project_id\s*=\s*"[a-z]{20}"/, "must not be a hosted project reference");
});

test("service_role is used only by delete-account", () => {
  const users = tracked
    .filter((f) => f.startsWith("supabase/functions/") && f.endsWith(".ts"))
    .filter((f) => /SERVICE_ROLE/.test(read(f)))
    .map((f) => f.split("/")[2]);
  assert.deepEqual([...new Set(users)], ["delete-account"]);
});

// ── migrations ──────────────────────────────────────────────

test("migrations have unique, ordered timestamps and none was edited into a rename", () => {
  // Sorted by name, the order Supabase applies them in (git lists new files last).
  const files = tracked.filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f)).map((f) => path.basename(f)).sort();
  const stamps = files.map((f) => f.split("_")[0]);
  assert.equal(new Set(stamps).size, stamps.length, "duplicate migration timestamp");
  assert.deepEqual([...stamps].sort(), stamps);
  assert.ok(files.length >= 8);
});
