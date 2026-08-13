// Kapy — the AI money buddy.
//
// This runs on Supabase's servers so the Gemini API key never ships inside
// the app bundle. Supabase verifies the caller's JWT before this code runs.
//
// Kapy can also *record* transactions, not just talk about them: say
// "masukkan RM 50 ke tabung saya" and it calls the add_transaction tool
// below, which inserts the row under the caller's own identity (so Row Level
// Security applies exactly as it would from the app).
//
// Deploy:
//   npx supabase secrets set GEMINI_API_KEY=...
//   npx supabase functions deploy kapy

import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "gemini-flash-latest";

// Gemini can call a tool, read the result, and want to call another. Bound the
// loop so a confused model can't spin forever on our bill.
const MAX_TOOL_ROUNDS = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type KapyMessage = { role: "user" | "model"; text: string };
type GeminiPart = Record<string, unknown>;
type GeminiContent = { role: string; parts: GeminiPart[] };

const buildSystemPrompt = (financialSummary: string) =>
  `You are Kapy 🦫 — a warm, chill capybara who is the user's personal money buddy inside Tabara, a budgeting app for young Malaysians.

## Your personality
- Friendly, calm, a little playful — like a supportive friend, never preachy or judgmental about money.
- Mirror the user's language: if they write in Malay, reply in natural Bahasa Malaysia; if English, reply in English; if they mix (Manglish/rojak), mix back. Match their vibe and formality. Keep it casual and easy to understand.
- Warm and encouraging. Celebrate small wins. If they overspent, be kind, not scolding.

## How you respond
- Match the length to the question. Quick question → short answer. "Recommend food" or "how do I save" → give a proper, helpful answer with a few options (use short bullet lists when listing places, tips, or steps).
- Be genuinely useful. You know Malaysia well — real makan spots, mamak culture, Touch 'n Go, PTPTN, zakat, cost of living, local prices. When they ask for recommendations, give specific, realistic suggestions with rough RM prices where helpful.
- Always connect advice back to their actual finances below when relevant.
- End with a light, encouraging nudge when it fits. Use the occasional emoji naturally (🦫💸🍜), don't overdo it.

## Recording transactions
You can record money in and out with the add_transaction tool. Use it when the user is clearly telling you about money that moved — "masukkan RM 50 ke tabung saya", "I spent 12 ringgit on lunch", "dapat gaji 2000".

- Only record what they actually said. Never invent an amount, and never round or adjust one.
- If the amount is unclear or you heard a range, ask before recording. It is much better to ask one short question than to save the wrong number.
- Money going into savings is an expense with category "savings" — it leaves their spendable budget. Salary or money received is income.
- Pick the closest category from the allowed list. Use "other" if nothing fits.
- After recording, say plainly what you saved, including the exact amount and category — for example "Done, saved RM 50 under Savings 🦫". Then they can check it and delete it from History if it is wrong.
- If they are only asking a question or talking hypothetically ("kalau saya simpan RM 50..."), do NOT record anything.

## Important
- You are not a licensed financial advisor. For big decisions (loans, investments), gently suggest they double-check with a real professional.
- Never make up the user's numbers — only use the data below.

## The user's real finances right now
${financialSummary}`;

/** One call to Gemini. Returns the first candidate's content. */
async function callGemini(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  categories: string[]
): Promise<GeminiContent | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header auth rather than ?key= so the secret never lands in a URL,
        // where it could show up in logs or proxies.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [
          {
            functionDeclarations: [
              {
                name: "add_transaction",
                description:
                  "Record a transaction the user just described. Only call this when they are stating money that actually moved, not when asking a hypothetical question.",
                parameters: {
                  type: "object",
                  properties: {
                    amount: {
                      type: "number",
                      description:
                        "Amount in Ringgit, as a positive number. No currency symbol.",
                    },
                    type: {
                      type: "string",
                      enum: ["expense", "income"],
                      description:
                        "'expense' for money going out, including money moved into savings. 'income' for money coming in.",
                    },
                    category: {
                      type: "string",
                      enum: categories,
                      description: "Closest matching category id.",
                    },
                    note: {
                      type: "string",
                      description:
                        "Short note, e.g. the shop name. Optional.",
                    },
                  },
                  required: ["amount", "type", "category"],
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
      }),
    }
  );

  if (!res.ok) {
    console.error("gemini error", res.status, await res.text());
    throw new Error("gemini_failed");
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json(
      { error: "Kapy isn't configured yet — GEMINI_API_KEY is missing." },
      500
    );
  }

  // Build the client from the caller's own token, so any insert below runs as
  // them and RLS keeps it to their own rows.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Please log in to chat with Kapy." }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: "Your session expired. Please log in again." }, 401);
  }

  let history: KapyMessage[];
  let financialSummary: string;
  let categories: string[];
  try {
    const body = await req.json();
    history = Array.isArray(body?.history) ? body.history : [];
    financialSummary = String(body?.financialSummary ?? "");
    categories = Array.isArray(body?.categories) ? body.categories : ["other"];
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  // Gemini rejects a conversation that opens on the model's turn.
  const msgs = [...history];
  while (msgs.length && msgs[0].role === "model") msgs.shift();
  if (msgs.length === 0) {
    return json({ error: "No message to reply to." }, 400);
  }

  const contents: GeminiContent[] = msgs.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const systemPrompt = buildSystemPrompt(financialSummary);

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const content = await callGemini(
        apiKey,
        systemPrompt,
        contents,
        categories
      );
      if (!content) break;

      const parts: GeminiPart[] = content.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);

      // No tool call — this is the final answer.
      if (calls.length === 0) {
        const reply = parts
          .map((p) => (typeof p.text === "string" ? p.text : ""))
          .join("")
          .trim();
        return json({ reply: reply || "Hmm, I blanked out 🦫 try again?" });
      }

      // Echo the model's turn back, then answer each tool call.
      contents.push({ role: "model", parts });

      const responses: GeminiPart[] = [];
      for (const part of calls) {
        const call = part.functionCall as { name: string; args: any };
        let result: Record<string, unknown>;

        if (call.name !== "add_transaction") {
          result = { success: false, error: "Unknown tool." };
        } else {
          const amount = Number(call.args?.amount);
          const type = call.args?.type === "income" ? "income" : "expense";
          const category = categories.includes(call.args?.category)
            ? call.args.category
            : "other";
          const note =
            typeof call.args?.note === "string" && call.args.note.trim()
              ? call.args.note.trim()
              : null;

          if (!Number.isFinite(amount) || amount <= 0) {
            result = {
              success: false,
              error: "Amount must be a positive number. Ask the user again.",
            };
          } else {
            const { error } = await supabase.from("transactions").insert({
              user_id: user.id,
              amount,
              type,
              category,
              note,
              date: new Date().toISOString(),
            });

            result = error
              ? { success: false, error: "Could not save it. Tell the user to try again." }
              : { success: true, amount, type, category };

            if (error) console.error("insert failed:", error);
          }
        }

        responses.push({
          functionResponse: { name: call.name, response: result },
        });
      }

      contents.push({ role: "user", parts: responses });
    }

    // Ran out of rounds without a plain text answer.
    return json({
      reply:
        "I got a bit tangled up there 🦫 could you say that again more simply?",
    });
  } catch (e) {
    console.error("kapy failed:", e);
    return json({ error: "Kapy couldn't reply right now. Try again." }, 500);
  }
});
