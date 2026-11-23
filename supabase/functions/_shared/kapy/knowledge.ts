// A small, curated knowledge base of general financial education for young
// Malaysians, retrieved by topic.
//
// What this is, and is not
// ------------------------
// - It is GENERAL EDUCATION: concepts, habits, and pointers to the institutions
//   that own the authoritative answers (Bank Negara Malaysia, AKPK, KWSP/EPF,
//   PTPTN, DOSM, the Securities Commission, state zakat authorities).
// - It deliberately contains NO interest rates, contribution rates, eligibility
//   rules, deadlines, fees or product terms. Those are set by the institutions,
//   they change, and an assistant that states them from memory will eventually
//   state them wrongly. Where a number matters the entry says who to ask.
//   (tests/kapy-knowledge.test.ts enforces this: no "RM", no percentages beyond
//   the 50/30/20 rule's own, and every official pointer is a bare homepage.)
// - It is distinct from personalised advice. Kapy answers questions about the
//   user's own money from the database; it answers "what is an emergency fund"
//   from here, and says which is which.
//
// REVIEW STATUS: every entry is `review: "unreviewed"`. The wording was written
// carefully and conservatively but has NOT been checked by a financial
// professional or against the institutions' current pages (the environment this
// was written in could not reach them). Someone accountable for Tabara's content
// should read each entry before production.
//
// Retrieval is lexical (topic keywords in Malay, English and Manglish), not
// semantic. It is deterministic and testable, and it fails safe: a question it
// cannot match returns nothing, and Kapy then says it does not have a vetted
// answer instead of improvising one.

import { normalize } from "./language.ts";

export interface Pointer {
  org: string;
  /** A bare homepage — never a deep link that can rot or be mistaken for a policy citation. */
  url: string;
  what: string;
}

export interface KnowledgeEntry {
  id: string;
  /** Matching phrases in Malay, English and Manglish. Longer phrases weigh more. */
  topics: string[];
  title: { en: string; ms: string };
  body: { en: string; ms: string };
  kind: "general_education" | "app_help" | "pointer";
  /** Numbers that appear in the text, so a grounded reply may repeat them. */
  figures?: number[];
  pointers?: Pointer[];
  review: "unreviewed" | "reviewed";
}

const BNM: Pointer = { org: "Bank Negara Malaysia", url: "https://www.bnm.gov.my", what: "consumer education and the regulator's public information" };
const AKPK: Pointer = { org: "AKPK", url: "https://www.akpk.org.my", what: "free credit counselling and money-management guidance" };
const KWSP: Pointer = { org: "KWSP / EPF", url: "https://www.kwsp.gov.my", what: "current contribution, account and withdrawal rules" };
const PTPTN: Pointer = { org: "PTPTN", url: "https://www.ptptn.gov.my", what: "current loan terms and repayment arrangements" };
const DOSM: Pointer = { org: "Department of Statistics Malaysia (DOSM)", url: "https://www.dosm.gov.my", what: "official household and price statistics" };
const SC: Pointer = { org: "Securities Commission Malaysia", url: "https://www.sc.com.my", what: "investor education and public alerts about unlicensed schemes" };

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "budget-50-30-20",
    topics: ["50/30/20", "50 30 20", "budget rule", "budgeting rule", "needs wants savings", "peraturan 50/30/20", "bajet 50/30/20", "50-30-20"],
    title: { en: "The 50/30/20 budgeting guideline", ms: "Garis panduan bajet 50/30/20" },
    body: {
      en: "A simple way to split take-home income: about 50% for needs (housing, groceries, transport, bills), about 30% for wants (eating out, shopping, entertainment) and about 20% for savings and paying down debt. It is a starting point, not a law: if your rent or loan payments are high, adjust the split to fit your life. Tabara shows your own Needs / Wants / Savings split so you can compare.",
      ms: "Cara mudah membahagi pendapatan bersih: kira-kira 50% untuk keperluan (rumah, barang dapur, pengangkutan, bil), kira-kira 30% untuk kehendak (makan luar, membeli-belah, hiburan) dan kira-kira 20% untuk simpanan dan bayar hutang. Ia titik permulaan, bukan peraturan wajib: kalau sewa atau bayaran pinjaman tinggi, ubah suai pembahagian ikut keadaan. Tabara tunjuk pecahan Needs / Wants / Savings anda sendiri untuk dibandingkan.",
    },
    kind: "general_education",
    figures: [50, 30, 20],
    review: "unreviewed",
  },
  {
    id: "emergency-fund",
    topics: ["emergency fund", "rainy day fund", "dana kecemasan", "duit kecemasan", "kecemasan", "emergency savings", "dana simpanan kecemasan"],
    title: { en: "Emergency fund", ms: "Dana kecemasan" },
    body: {
      en: "An emergency fund is money set aside for unexpected costs, such as losing a job, a medical bill or an urgent repair. A commonly quoted rule of thumb is to build up several months of essential expenses over time, often given as three to six months. That is a general guideline, not an official requirement. Start with a small first goal, keep it separate from daily spending, and keep it easy to reach.",
      ms: "Dana kecemasan ialah wang yang diketepikan untuk perbelanjaan tak dijangka, contohnya hilang kerja, bil perubatan atau pembaikan segera. Panduan umum yang kerap disebut ialah mengumpul beberapa bulan perbelanjaan asas secara beransur-ansur, selalunya tiga hingga enam bulan. Itu garis panduan umum, bukan syarat rasmi. Mulakan dengan sasaran kecil, asingkan daripada belanja harian, dan simpan di tempat yang mudah diakses.",
    },
    kind: "general_education",
    figures: [3, 6],
    review: "unreviewed",
  },
  {
    id: "needs-vs-wants",
    topics: ["needs vs wants", "needs and wants", "needs dan wants", "keperluan dan kehendak", "keperluan vs kehendak", "need or want", "what is a need", "what is a want"],
    title: { en: "Needs versus wants", ms: "Keperluan dan kehendak" },
    body: {
      en: "Needs are costs you cannot reasonably avoid, such as housing, basic groceries, transport to work or study, utilities, health and minimum loan payments. Wants are things that improve life but could be reduced or skipped, such as eating out, shopping, entertainment and subscriptions. Some items sit in between (a phone plan, for example), so use your own judgement. Tabara labels each category as Needs or Wants and shows which side a transaction falls on before you save it.",
      ms: "Keperluan ialah kos yang sukar dielakkan, seperti rumah, barang dapur asas, pengangkutan ke tempat kerja atau belajar, bil utiliti, kesihatan dan bayaran minimum pinjaman. Kehendak ialah perkara yang menambah keselesaan tetapi boleh dikurangkan atau dilangkau, seperti makan luar, membeli-belah, hiburan dan langganan. Ada yang di tengah-tengah (contohnya pelan telefon), jadi guna pertimbangan sendiri. Tabara melabel setiap kategori sebagai Needs atau Wants dan tunjuk di sebelah mana transaksi itu jatuh sebelum anda simpan.",
    },
    kind: "general_education",
    review: "unreviewed",
  },
  {
    id: "saving-habits",
    topics: ["saving habit", "saving habits", "how to save", "build savings", "pay yourself first", "tabiat menyimpan", "cara menyimpan", "cara simpan", "tabung", "discipline", "financial discipline", "disiplin kewangan", "konsisten"],
    title: { en: "Building a saving habit", ms: "Membina tabiat menyimpan" },
    body: {
      en: "Habits beat willpower. Pay yourself first: move a fixed amount to savings as soon as income arrives, before spending. Start small and keep it steady, since the habit matters more than the size at the beginning. Review your spending once a week, and let Tabara's streak and savings category help you stay consistent.",
      ms: "Tabiat lebih berkesan daripada semangat sementara. Bayar diri dulu: pindahkan jumlah tetap ke simpanan sebaik sahaja pendapatan masuk, sebelum berbelanja. Mulakan kecil tetapi konsisten, kerana tabiat lebih penting daripada jumlah pada peringkat awal. Semak perbelanjaan seminggu sekali, dan biar streak serta kategori simpanan dalam Tabara membantu anda kekal konsisten.",
    },
    kind: "general_education",
    review: "unreviewed",
  },
  {
    id: "reduce-spending",
    topics: ["reduce spending", "cut spending", "spend less", "save money", "impulse buying", "impulse", "kurangkan belanja", "kurangkan perbelanjaan", "jimat", "jimat cermat", "boros", "kawal belanja", "stop spending", "overspending"],
    title: { en: "Ways to spend less", ms: "Cara mengurangkan perbelanjaan" },
    body: {
      en: "Start by seeing where the money goes: look at your top categories in Insights. Set a monthly limit for the one or two categories that run highest (the Budgets screen does this). For impulse buys, wait a day before paying. Review subscriptions and auto-debits you no longer use, and avoid late fees. Small cuts in the biggest wants usually matter more than many tiny ones.",
      ms: "Mulakan dengan melihat ke mana wang pergi: semak kategori teratas dalam Insights. Tetapkan had bulanan untuk satu atau dua kategori yang paling tinggi (skrin Budgets membolehkannya). Untuk pembelian impuls, tunggu sehari sebelum bayar. Semak langganan dan auto-debit yang tak digunakan lagi, dan elakkan caj lewat. Potongan kecil pada kehendak terbesar biasanya lebih bermakna daripada banyak potongan kecil.",
    },
    kind: "general_education",
    review: "unreviewed",
  },
  {
    id: "debt-basics",
    topics: ["debt", "hutang", "loan", "pinjaman", "credit card", "kad kredit", "pay off debt", "bayar hutang", "debt management", "pengurusan hutang", "minimum payment", "bayaran minimum", "ccris", "credit score", "skor kredit"],
    title: { en: "Basic debt management", ms: "Asas pengurusan hutang" },
    body: {
      en: "List every debt with its monthly payment and how costly it is. Always pay on time, because late payments cost money and can hurt your credit record. Where you can, pay more than the minimum on the most expensive debt first. If you are struggling, speak to your lender early rather than late. AKPK offers free credit counselling and debt-management guidance in Malaysia. Specific terms depend on your lender, so check your agreement.",
      ms: "Senaraikan setiap hutang berserta bayaran bulanan dan betapa mahal kosnya. Bayar sentiasa tepat pada masa kerana bayaran lewat menambah kos dan boleh menjejaskan rekod kredit. Jika mampu, bayar lebih daripada minimum untuk hutang yang paling mahal dahulu. Kalau sukar, berbincang dengan pemberi pinjaman lebih awal. AKPK menawarkan kaunseling kredit percuma dan panduan pengurusan hutang di Malaysia. Terma sebenar bergantung pada pemberi pinjaman anda, jadi semak perjanjian anda.",
    },
    kind: "general_education",
    pointers: [AKPK, BNM],
    review: "unreviewed",
  },
  {
    id: "ptptn",
    topics: ["ptptn", "student loan", "education loan", "pinjaman pendidikan", "pinjaman ptptn", "bayar ptptn", "repay ptptn", "loan study", "tabung pendidikan"],
    title: { en: "PTPTN awareness", ms: "Kesedaran tentang PTPTN" },
    body: {
      en: "PTPTN is the national body that provides higher-education loans. Repayment normally begins after you finish studying, and the exact terms, repayment schedule and any incentives are set by PTPTN and can change. For your own account and current rules, check PTPTN directly. Planning tip: once you start earning, decide a fixed monthly amount for it and treat it as a need. In Tabara you can log it under Education / PTPTN.",
      ms: "PTPTN ialah badan kebangsaan yang menyediakan pinjaman pengajian tinggi. Bayaran balik biasanya bermula selepas anda tamat belajar, dan terma tepat, jadual bayaran serta sebarang insentif ditetapkan oleh PTPTN dan boleh berubah. Untuk akaun dan peraturan terkini anda, semak terus dengan PTPTN. Tip perancangan: bila mula bekerja, tetapkan jumlah bulanan tetap dan anggap sebagai keperluan. Dalam Tabara anda boleh catat di bawah Education / PTPTN.",
    },
    kind: "pointer",
    pointers: [PTPTN],
    review: "unreviewed",
  },
  {
    id: "epf-kwsp",
    topics: ["epf", "kwsp", "retirement", "persaraan", "pension", "simpanan persaraan", "retirement savings", "what is epf", "apa itu kwsp"],
    title: { en: "EPF / KWSP awareness", ms: "Kesedaran tentang KWSP" },
    body: {
      en: "KWSP (EPF) is Malaysia's retirement savings scheme for workers, funded by contributions from employees and employers. How accounts are structured, what the contribution rates are and when money can be withdrawn are decided by KWSP and can change, so check KWSP for the current rules rather than relying on memory. A useful habit for a first job: look at your payslip to see that contributions are being made.",
      ms: "KWSP (EPF) ialah skim simpanan persaraan Malaysia untuk pekerja, dibiayai oleh caruman pekerja dan majikan. Struktur akaun, kadar caruman dan bila wang boleh dikeluarkan ditentukan oleh KWSP dan boleh berubah, jadi semak KWSP untuk peraturan terkini dan jangan bergantung pada ingatan. Tabiat berguna untuk kerja pertama: tengok slip gaji untuk pastikan caruman dibuat.",
    },
    kind: "pointer",
    pointers: [KWSP],
    review: "unreviewed",
  },
  {
    id: "duitnow-ewallet",
    topics: ["duitnow", "e-wallet", "ewallet", "e wallet", "touch n go ewallet", "tng ewallet", "qr pay", "qr payment", "grabpay", "boost", "shopeepay", "cashless", "bayaran qr", "dompet digital"],
    title: { en: "DuitNow and e-wallet spending", ms: "Perbelanjaan DuitNow dan e-wallet" },
    body: {
      en: "DuitNow and e-wallets make paying quick, which can make spending feel invisible. To keep track: log what you actually buy, and decide whether you record the top-up or the individual purchases, then stay consistent so the same money is not counted twice. Check your e-wallet history weekly and turn off auto-debits and auto-reloads you no longer need.",
      ms: "DuitNow dan e-wallet menjadikan pembayaran pantas, sehingga perbelanjaan terasa tak kelihatan. Untuk menjejak: catat apa yang anda sebenarnya beli, dan putuskan sama ada anda merekod tambah nilai atau pembelian individu, kemudian kekal konsisten supaya wang yang sama tidak dikira dua kali. Semak sejarah e-wallet setiap minggu dan matikan auto-debit serta auto-reload yang tak diperlukan lagi.",
    },
    kind: "general_education",
    review: "unreviewed",
  },
  {
    id: "cost-of-living",
    topics: ["cost of living", "kos sara hidup", "kos hidup", "living costs", "rising prices", "harga naik", "inflation", "inflasi", "price increase"],
    title: { en: "Cost of living", ms: "Kos sara hidup" },
    body: {
      en: "Costs differ a lot between cities and lifestyles, so compare against your own history first. Separate fixed costs (rent, loan, utilities) from variable ones (food, transport, fun); the variable part is where you have the most control. Inflation means the same ringgit buys less over time, which is one reason to keep saving steadily. For official national figures, see the Department of Statistics Malaysia.",
      ms: "Kos berbeza banyak antara bandar dan gaya hidup, jadi bandingkan dengan sejarah anda sendiri dahulu. Asingkan kos tetap (sewa, pinjaman, utiliti) daripada kos berubah (makan, pengangkutan, hiburan); bahagian berubah itulah yang paling boleh dikawal. Inflasi bermaksud ringgit yang sama membeli lebih sedikit dari masa ke masa, satu sebab untuk terus menyimpan dengan konsisten. Untuk angka rasmi kebangsaan, rujuk Jabatan Perangkaan Malaysia.",
    },
    kind: "general_education",
    pointers: [DOSM],
    review: "unreviewed",
  },
  {
    id: "student-graduate-planning",
    topics: ["fresh grad", "fresh graduate", "graduate", "university student", "student budget", "pelajar", "pelajar universiti", "siswazah", "baru kerja", "first job", "kerja pertama", "budget untuk pelajar", "student"],
    title: { en: "Money basics for students and fresh graduates", ms: "Asas wang untuk pelajar dan graduan baharu" },
    body: {
      en: "For students: list your regular income (allowance, loan, part-time) and your fixed costs, then budget what is left week by week. For a first job: set up a small emergency buffer first, avoid raising your lifestyle every time pay rises, make sure you understand any education loan you carry, and start a small automatic saving even if it is tiny. Set your income and savings goal in Tabara so it can show your real budget.",
      ms: "Untuk pelajar: senaraikan pendapatan tetap (elaun, pinjaman, kerja sambilan) dan kos tetap, kemudian bajetkan baki mingguan. Untuk kerja pertama: bina simpanan kecemasan kecil dahulu, elakkan menaikkan gaya hidup setiap kali gaji naik, fahami pinjaman pendidikan yang ditanggung, dan mulakan simpanan automatik kecil walaupun sedikit. Tetapkan pendapatan dan sasaran simpanan dalam Tabara supaya ia boleh menunjukkan bajet sebenar anda.",
    },
    kind: "general_education",
    review: "unreviewed",
  },
  {
    id: "compound-interest",
    topics: ["compound interest", "compounding", "faedah kompaun", "kompaun", "interest", "faedah", "eli5 compound", "how interest works"],
    title: { en: "Compound interest", ms: "Faedah kompaun" },
    body: {
      en: "Compounding means earnings start earning too: interest is added to your balance, and the next round is calculated on the larger balance. The longer money stays invested or saved, the more this effect builds. The same maths works against you on debt, where interest can grow on unpaid interest. Actual rates depend on the product, so compare offers rather than assuming.",
      ms: "Kompaun bermaksud pulangan turut menjana pulangan: faedah ditambah ke baki anda, dan pusingan seterusnya dikira atas baki yang lebih besar. Semakin lama wang disimpan atau dilaburkan, semakin besar kesannya. Matematik yang sama merugikan anda untuk hutang, kerana faedah boleh bertambah atas faedah yang belum dibayar. Kadar sebenar bergantung pada produk, jadi bandingkan tawaran dan jangan andaikan.",
    },
    kind: "general_education",
    review: "unreviewed",
  },
  {
    id: "zakat-awareness",
    topics: ["zakat", "zakat simpanan", "zakat on savings", "zakat pendapatan", "zakat income", "sedekah", "kewajipan zakat"],
    title: { en: "Zakat awareness", ms: "Kesedaran tentang zakat" },
    body: {
      en: "Zakat is a religious obligation for eligible Muslims, and it can apply to savings, income and other wealth. Whether it applies to you, the threshold and the amount are decided by the state zakat authority, not by an app, so please check with your state's zakat centre or official portal. In Tabara you can record payments under Zakat & Sedekah to keep track of them.",
      ms: "Zakat ialah kewajipan agama bagi Muslim yang layak, dan boleh melibatkan simpanan, pendapatan serta harta lain. Sama ada ia terpakai kepada anda, kadar nisab dan jumlahnya ditentukan oleh pihak berkuasa zakat negeri, bukan oleh aplikasi, jadi sila semak dengan pusat zakat negeri atau portal rasmi anda. Dalam Tabara anda boleh catat bayaran di bawah Zakat & Sedekah untuk menjejakinya.",
    },
    kind: "pointer",
    review: "unreviewed",
  },
  {
    id: "investing-caution",
    topics: ["invest", "investing", "investment", "pelaburan", "melabur", "saham", "stocks", "unit trust", "asb", "asnb", "scam", "penipuan", "guaranteed return", "pulangan dijamin", "get rich", "skim cepat kaya"],
    title: { en: "Investing: general caution", ms: "Pelaburan: peringatan umum" },
    body: {
      en: "Kapy can explain general ideas but cannot recommend investments or promise returns. Be careful with anything that guarantees high returns with little risk, and check that a firm or product is licensed before you hand over money. Regulators such as the Securities Commission Malaysia and Bank Negara Malaysia publish public alerts about unlicensed schemes. For decisions about specific products, speak to a licensed professional.",
      ms: "Kapy boleh menerangkan konsep umum tetapi tidak boleh mengesyorkan pelaburan atau menjanjikan pulangan. Berhati-hati dengan apa-apa yang menjamin pulangan tinggi tanpa risiko, dan semak sama ada firma atau produk itu berlesen sebelum menyerahkan wang. Pengawal selia seperti Suruhanjaya Sekuriti Malaysia dan Bank Negara Malaysia menerbitkan amaran awam tentang skim tidak berlesen. Untuk keputusan tentang produk tertentu, berbincang dengan profesional berlesen.",
    },
    kind: "general_education",
    pointers: [SC, BNM],
    review: "unreviewed",
  },
  {
    id: "scope-and-limits",
    topics: ["are you a financial advisor", "financial advisor", "penasihat kewangan", "boleh percaya", "can i trust", "is this advice", "bukan nasihat", "licensed", "berlesen"],
    title: { en: "What Kapy can and cannot do", ms: "Apa yang Kapy boleh dan tak boleh buat" },
    body: {
      en: "Kapy helps you understand your own spending and explains general money ideas. It is not a licensed financial adviser and does not give investment, loan or insurance recommendations. For big decisions, talk to a licensed professional. AKPK offers free counselling, and Bank Negara Malaysia publishes consumer information.",
      ms: "Kapy membantu anda memahami perbelanjaan sendiri dan menerangkan konsep wang secara umum. Kapy bukan penasihat kewangan berlesen dan tidak memberi cadangan pelaburan, pinjaman atau insurans. Untuk keputusan besar, berbincang dengan profesional berlesen. AKPK menawarkan kaunseling percuma, dan Bank Negara Malaysia menerbitkan maklumat pengguna.",
    },
    kind: "pointer",
    pointers: [AKPK, BNM],
    review: "unreviewed",
  },
];

// ── retrieval ───────────────────────────────────────────────

export interface KnowledgeHit {
  id: string;
  title: string;
  text: string;
  kind: KnowledgeEntry["kind"];
  figures: number[];
  officialPointers: Pointer[];
  score: number;
}

const normalizedTopics = KNOWLEDGE.map((e) => ({
  entry: e,
  topics: e.topics.map((t) => ` ${normalize(t)} `),
}));

/** Minimum evidence to answer from the knowledge base at all. */
export const MIN_KNOWLEDGE_SCORE = 2;

/**
 * Entries relevant to a question, best first. Phrase matches outweigh single
 * words; a question that matches nothing returns nothing, rather than the
 * closest guess.
 */
export function searchKnowledge(query: string, lang: "en" | "ms" | "manglish" = "en", limit = 2): KnowledgeHit[] {
  const q = ` ${normalize(query)} `;
  if (q.trim().length === 0) return [];

  const scored = normalizedTopics
    .map(({ entry, topics }) => {
      let score = 0;
      for (const t of topics) {
        if (q.includes(t)) score += t.trim().includes(" ") || /[/-]/.test(t) ? 3 : 2;
      }
      return { entry, score };
    })
    .filter((x) => x.score >= MIN_KNOWLEDGE_SCORE)
    .sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? -1 : 1))
    .slice(0, Math.max(1, Math.min(limit, 3)));

  const key = lang === "en" ? "en" : "ms";
  return scored.map(({ entry, score }) => ({
    id: entry.id,
    title: entry.title[key],
    text: entry.body[key],
    kind: entry.kind,
    figures: entry.figures ?? [],
    officialPointers: entry.pointers ?? [],
    score,
  }));
}
