import { CATEGORIES } from "../constants/categories";

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const MODEL = "gemini-flash-latest";

async function callGemini(body: any) {
  if (!API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY — add it to .env and restart with -c.");
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface ReceiptResult {
  amount: number | null;
  merchant: string | null;
  category: string;
}

const categoryList = CATEGORIES.map((c) => c.id).join(", ");

export async function scanReceipt(base64: string, mimeType = "image/jpeg"): Promise<ReceiptResult> {
  const prompt = `You are a receipt scanner for a Malaysian money-tracking app.
Read this receipt image and extract:
- amount: the TOTAL paid, as a plain number (no "RM", no commas)
- merchant: the shop or business name
- category: pick the single best id from this list: ${categoryList}

Reply with JSON only: {"amount": number, "merchant": string, "category": string}
If a value is unreadable, use null for amount/merchant and "other" for category.`;

  const json = await callGemini({
    contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }

  const category = CATEGORIES.some((c) => c.id === parsed.category) ? parsed.category : "other";
  return {
    amount: typeof parsed.amount === "number" ? parsed.amount : parseFloat(parsed.amount) || null,
    merchant: parsed.merchant ?? null,
    category,
  };
}

export interface KapyMessage {
  role: "user" | "model";
  text: string;
}

export async function askKapy(history: KapyMessage[], financialSummary: string): Promise<string> {
  const system = `You are Kapy 🦫 — a warm, chill capybara who is the user's personal money buddy inside Tabara, a budgeting app for young Malaysians.

## Your personality
- Friendly, calm, a little playful — like a supportive friend, never preachy or judgmental about money.
- Mirror the user's language: if they write in Malay, reply in natural Bahasa Malaysia; if English, reply in English; if they mix (Manglish/rojak), mix back. Match their vibe and formality. Keep it casual and easy to understand.
- Warm and encouraging. Celebrate small wins. If they overspent, be kind, not scolding.

## How you respond
- Match the length to the question. Quick question → short answer. "Recommend food" or "how do I save" → give a proper, helpful answer with a few options (use short bullet lists when listing places, tips, or steps).
- Be genuinely useful. You know Malaysia well — real makan spots, mamak culture, Touch 'n Go, PTPTN, zakat, cost of living, local prices. When they ask for recommendations, give specific, realistic suggestions with rough RM prices where helpful.
- Always connect advice back to their actual finances below when relevant.
- End with a light, encouraging nudge when it fits. Use the occasional emoji naturally (🦫💸🍜), don't overdo it.

## Important
- You are not a licensed financial advisor. For big decisions (loans, investments), gently suggest they double-check with a real professional.
- Never make up the user's numbers — only use the data below.

## The user's real finances right now
${financialSummary}`;

  const msgs = [...history];
  while (msgs.length && msgs[0].role === "model") msgs.shift();

  const json = await callGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents: msgs.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
  });

  return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "Hmm, I blanked out 🦫 try again?";
}