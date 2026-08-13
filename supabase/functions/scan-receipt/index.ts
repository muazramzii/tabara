// Receipt scanner — reads a photo of a receipt and pulls out the total,
// merchant and category.
//
// Same reason as kapy/: the Gemini key stays on the server. Supabase verifies
// the caller's JWT before this runs.
//
// Deploy:
//   npx supabase functions deploy scan-receipt

const MODEL = "gemini-flash-latest";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json(
      { error: "Scanning isn't configured yet — GEMINI_API_KEY is missing." },
      500
    );
  }

  let base64: string;
  let mimeType: string;
  let categories: string[];
  try {
    const body = await req.json();
    base64 = String(body?.base64 ?? "");
    mimeType = String(body?.mimeType ?? "image/jpeg");
    // The category list comes from the app so constants/categories.ts stays
    // the single source of truth — no duplicated list to drift out of sync.
    categories = Array.isArray(body?.categories) ? body.categories : [];
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (!base64) return json({ error: "No image provided." }, 400);
  if (categories.length === 0) {
    return json({ error: "No category list provided." }, 400);
  }

  const prompt = `You are a receipt scanner for a Malaysian money-tracking app.
Read this receipt image and extract:
- amount: the TOTAL paid, as a plain number (no "RM", no commas)
- merchant: the shop or business name
- category: pick the single best id from this list: ${categories.join(", ")}

Reply with JSON only: {"amount": number, "merchant": string, "category": string}
If a value is unreadable, use null for amount/merchant and "other" for category.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!res.ok) {
      console.error("gemini error", res.status, await res.text());
      return json({ error: "Couldn't read that receipt. Try again." }, 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    // responseMimeType should give us clean JSON, but models occasionally
    // still wrap it in a ```json fence — strip and retry once before giving up.
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      try {
        parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        return json({ error: "Couldn't read that receipt. Try again." }, 502);
      }
    }

    const amount =
      typeof parsed.amount === "number"
        ? parsed.amount
        : parseFloat(parsed.amount) || null;

    return json({
      amount,
      merchant: parsed.merchant ?? null,
      // Validated again on the client against the real category list.
      category: categories.includes(parsed.category) ? parsed.category : "other",
    });
  } catch (e) {
    console.error("scan-receipt failed:", e);
    return json({ error: "Couldn't read that receipt. Try again." }, 500);
  }
});
