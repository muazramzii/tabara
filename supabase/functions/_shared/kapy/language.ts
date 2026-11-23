// Language handling for Malaysian messages: Bahasa Melayu, English, and the
// code-switching in between ("Manglish").
//
// What this does and does not do
// ------------------------------
// - It NEVER rewrites the user's message. The original text is what the model
//   sees. Normalisation exists only so that this module's own lexicon lookups
//   survive informal spelling ("brp", "xde", "skrg", "gilaaa").
// - It decides which language STYLE to reply in. Replying to "Weh duit aku tinggal
//   berapa" in formal English would be wrong; so would translating everything.
// - It is a lexicon-and-proportion detector, not a language model. It is good at
//   the clear cases and honest about the unclear ones (`confidence`, and
//   "unknown" for messages too short to tell). Its accuracy is measured in
//   tests/kapy-language.test.ts against labelled sentences, not assumed.
//
// No imports: runs unchanged under Deno and the Node test runner.

export type Lang = "ms" | "en" | "manglish" | "unknown";

// ── informal spelling → canonical form ──────────────────────

/** Whole-word replacements. A value with a space expands to several tokens. */
const SPELLING: Record<string, string> = {
  brp: "berapa", brapa: "berapa", berapaa: "berapa", brpa: "berapa",
  skrg: "sekarang", skrang: "sekarang", sekarg: "sekarang", skg: "sekarang", now: "now",
  xde: "tak ada", takde: "tak ada", tkde: "tak ada", xda: "tak ada", tiada: "tak ada",
  dkt: "dekat", dkat: "dekat", dgn: "dengan", dengn: "dengan",
  tp: "tapi", yg: "yang", utk: "untuk", untk: "untuk", sbb: "sebab", sbbtu: "sebab itu",
  lps: "lepas", lpas: "lepas", blm: "belum", belom: "belum", bln: "bulan", blan: "bulan",
  mcm: "macam", mcmana: "macam mana", macamana: "macam mana", camne: "macam mana", cmne: "macam mana",
  bgmn: "bagaimana", bagaimana: "macam mana",
  x: "tak", xnak: "tak nak", xmau: "tak nak", nk: "nak", jgn: "jangan",
  sgt: "sangat", sgt2: "sangat", byk: "banyak", bnyk: "banyak", skit: "sikit", sket: "sikit",
  dh: "dah", sdh: "dah", sudah: "dah", dahh: "dah",
  kt: "kat", ni: "ni", ini: "ni", tu: "tu", itu: "tu",
  duid: "duit", duet: "duit", wang: "duit",
  blnja: "belanja", belnja: "belanja", blanja: "belanja",
  simpn: "simpan", smpan: "simpanan",
  org: "orang", ape: "apa", cmtu: "macam tu", camtu: "macam tu",
  tq: "thanks", tqvm: "thanks", thx: "thanks", thanx: "thanks", tenkiu: "thanks", ty: "thanks",
  pls: "please", plz: "please", u: "you", ur: "your", r: "are", ppl: "people",
  spnd: "spend", spendd: "spend", spendin: "spending",
  hai: "hi", helo: "hello", hye: "hi", hey: "hi",
  okey: "okay", okayy: "okay", ok: "okay", okla: "okay lah", okla2: "okay lah",
  jap: "jap", kejap: "jap", sekejap: "jap", jkjp: "jap",
  tmrw: "tomorrow", yday: "yesterday", ytd: "yesterday", sem: "semalam",
  rite: "right", wanna: "want to", gonna: "going to",
};

export function normalize(text: string): string {
  let s = text.normalize("NFKC").toLowerCase();
  // "gilaaaa" -> "gila", "sangattt" -> "sangat": three or more of a letter is emphasis.
  s = s.replace(/([a-z])\1{2,}/g, "$1");
  // Keep digits, decimal points and thousands commas inside numbers; spaces elsewhere.
  s = s.replace(/[^a-z0-9.,/%&'\s-]/g, " ");
  s = s.replace(/(?<![0-9])[.,]|[.,](?![0-9])/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const raw of s.split(" ")) {
    const token = raw.replace(/^[-'&]+|[-'&]+$/g, "");
    if (!token) continue;
    const mapped = Object.prototype.hasOwnProperty.call(SPELLING, token) ? SPELLING[token] : token;
    out.push(mapped);
  }
  // "dis month" is texting for "this month"; "bulan dis" is Malay for December.
  // Only the first reading is safe to rewrite here, and only before these nouns.
  return out.join(" ").replace(/\bdis (month|week|year|time|morning|evening)\b/g, "this $1");
}

/** Letter-only word tokens of an already-normalised string. */
export const wordsOf = (normalized: string): string[] =>
  normalized.split(" ").filter((t) => /^[a-z][a-z'-]*$/.test(t));

// ── lexicons ────────────────────────────────────────────────

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Words that are Malay and not English. */
const MALAY = set(`
  aku kau kamu awak saya engkau dia kita kami korang mereka
  dah belum tak tidak bukan ada nak mahu hendak boleh perlu patut mesti
  berapa apa siapa mana bila kenapa mengapa macam bagaimana
  yang untuk dengan dekat kat dari pada dalam atas bawah sampai hingga
  ni tu lagi pun jugak juga sangat banyak sikit sedikit terlalu terlebih paling lebih kurang cukup
  habis tinggal baki duit belanja perbelanjaan simpan simpanan tabung gaji pendapatan bajet
  bulan minggu hari semalam tahun sekarang tadi esok lepas lalu depan hujung akhir
  kalau jika tapi tetapi sebab kerana dan atau
  tolong sila cuba tengok lihat kira banding bandingkan senarai tunjuk tunjukkan bagi beri
  dapat terima masuk keluar beli bayar makan minum kereta minyak
  rasa fikir tahu faham maksud jimat kurangkan tambah naik turun makin semakin mula siap
  jap saja je jer pulak pula rendah tinggi cadangan susun buat pelajar kecemasan dana
  masukkan letak ambil kena lebih baru lama bila-bila selalu jarang kadang
  macam mana betul salah okay-lah ke-mana kat-mana apa-apa
  raya duit-raya hutang pinjaman bil elektrik sewa tol makanan minuman kopi sarapan
  terima kasih kasih selamat pagi petang malam tengah hari
  berfungsi guna gunakan habiskan kumpul tapau lemak nasi boros beza terangkan
`);

/** Words that are English and not Malay. */
const ENGLISH = set(`
  the a an is am are was were be been i me my mine you your we our it its this that these those
  how much many what which who when where why did do does have has had can could will would should may
  spend spent spending money left balance income earn earned save saved saving savings budget
  over under month week day today yesterday last past next so far total compare comparison trend
  show list tell check tips advice plan afford expenses expense category categories most more less
  too very than with for of on in at to from and or but if any anything thanks thank hi hello please
  just got paid bought received record add explain mean calculate calculated higher lower up down going
  getting lot little enough run out end by until about again also because between during each every
  food groceries transport shopping bills entertainment health education transactions transaction
  rate rule fund emergency what's it's i'm don't can't won't
  better worse recent recently lately usually always never still already even only own much
  within looking look fresh grad student students monthly daily weekly yearly average
  need want wants needs know think feel see give make take keep put let way help
  overspend overspent overspending vs versus burst monthly weekly
  whats hows wheres thats dont cant im ive compound interest cash impulse buying tips idea normal
  good morning night evening afternoon cut down weekly walao ways takeaway rn bank
`);

/** Neutral: appear in both languages, or are proper nouns / brands / app words. */
const NEUTRAL = set(`
  rm myr ringgit kapy tabara ptptn epf kwsp tng grab shopee lazada mydin netflix spotify
  okay ok lah la kan kot eh ah ke ya yes no nope hmm hm um uh
  wifi internet food bil bills need
`);

/** Markers of Manglish itself: they signal code-switching regardless of the rest. */
const MANGLISH_MARKERS = set("lor meh leh mah sia wei weh wah aiyo aiyoh bro sis walao alamak");

export interface LangDetection {
  lang: Lang;
  /** 0-1: how clearly the evidence points at `lang`. Low for short messages. */
  confidence: number;
  msWords: number;
  enWords: number;
  markers: number;
}

export function detectLanguage(text: string): LangDetection {
  const words = wordsOf(normalize(text));
  let ms = 0;
  let en = 0;
  let markers = 0;
  for (const w of words) {
    if (MANGLISH_MARKERS.has(w)) {
      markers++;
      continue;
    }
    if (NEUTRAL.has(w)) continue;
    const inMs = MALAY.has(w);
    const inEn = ENGLISH.has(w);
    if (inMs && !inEn) ms++;
    else if (inEn && !inMs) en++;
  }
  const content = ms + en;
  const base = { msWords: ms, enWords: en, markers };

  if (content === 0) {
    return markers > 0
      ? { ...base, lang: "manglish", confidence: 0.4 }
      : { ...base, lang: "unknown", confidence: 0 };
  }

  const minor = Math.min(ms, en) / content;
  const dominant: Lang = ms >= en ? "ms" : "en";
  // More words, more certainty; one or two words is a guess.
  const evidence = Math.min(1, content / 5);

  // A genuine mix, or an unmistakably Manglish particle on top of any text.
  if (minor >= 0.25) return { ...base, lang: "manglish", confidence: Math.min(1, 0.5 + minor) * evidence };
  if (markers > 0) return { ...base, lang: "manglish", confidence: 0.6 * evidence };

  // English text carrying a Malay particle ("okay lah thanks") is Manglish; Malay
  // text with an English loanword or two is still Malay.
  const text2 = " " + normalize(text) + " ";
  if (dominant === "en" && /\s(lah|la|kan|kot|ke|eh|ah)\s/.test(text2)) {
    return { ...base, lang: "manglish", confidence: 0.55 * evidence };
  }
  return { ...base, lang: dominant, confidence: (1 - minor) * evidence };
}

/**
 * The style to reply in, judged from the user's recent messages (newest last).
 * Recent messages weigh more, so a person who switches style mid-chat is
 * followed rather than held to how they began. Unknown evidence counts for
 * nothing; with none at all the answer is English.
 */
export function conversationLanguage(userMessages: string[]): Exclude<Lang, "unknown"> {
  const recent = userMessages.slice(-3);
  const weights = [0.2, 0.3, 0.5].slice(3 - recent.length);
  const score: Record<string, number> = { ms: 0, en: 0, manglish: 0 };
  recent.forEach((m, i) => {
    const d = detectLanguage(m);
    if (d.lang === "unknown") return;
    score[d.lang] += weights[i] * Math.max(d.confidence, 0.2);
  });
  const best = (Object.entries(score) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? (best[0] as Exclude<Lang, "unknown">) : "en";
}
