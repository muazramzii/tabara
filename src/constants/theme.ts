// Tabara — cozy sage-green capybara palette 🦫
//
// Every key that existed before is still here with the same value, so nothing
// that already imports `theme` changes behaviour. The additions below are the
// design-system layer: spacing, type scale, semantic money colours, and a
// calmer category palette.
import { Platform } from "react-native";

/**
 * Height of the bottom tab bar.
 *
 * Shared rather than written in two places: the Kapy composer has to know it
 * to clear the keyboard, and a tab bar that grew without the composer knowing
 * would put the text field back under the keyboard.
 */
export const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 84 : 66;

export const theme = {
  // surfaces
  bg: "#F4EFE4", // warm cream
  card: "#FFFFFF", // clean white cards
  cardAlt: "#EDE6D6",

  // brand
  primary: "#A8744E", // capybara caramel brown
  primaryDark: "#6F5A45", // taupe-brown for headers and the balance hero
  accent: "#88A878", // cozy sage green
  accentSoft: "#DCE6D0", // soft green (chat bubbles, quick-action band)
  peach: "#E9A87E",
  gold: "#E8C24A", // badges / highlights
  danger: "#C5664E",

  // text
  text: "#3D352B", // warm near-black
  muted: "#9A8E7E",
  border: "#E8DFCF",

  // ── on dark surfaces (the brown hero, profile header) ────
  onDark: "#FFFFFF",
  onDarkMuted: "#E6DECF", // warm cream, readable on primaryDark
  onGold: "#5A4A1E", // text that sits on the gold badge
  incomeSoft: "#A8D5BA", // pale green icon on dark
  expenseSoft: "#E9B4A8", // pale clay icon on dark

  // ── semantic money colours ───────────────────────────────
  // Used for amounts and progress bars so the meaning of a colour is
  // consistent everywhere: green is money in, clay is money out.
  income: "#6E9E70",
  expense: "#C5664E",
  warning: "#D9A441",
  info: "#7A94AD",

  // ── 8dp spacing scale ────────────────────────────────────
  space: { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32 },

  // Standard horizontal padding for a screen's content.
  screenPadding: 20,

  radius: { sm: 12, md: 16, lg: 22, xl: 28 },

  // ── type scale ───────────────────────────────────────────
  // Sizes only. Weight is set per-use, because setup-fonts.ts maps
  // fontWeight → the matching Nunito file automatically.
  size: {
    hero: 36, // the one big balance number
    display: 28, // secondary large figures
    title: 22, // screen titles
    section: 17, // section headings
    body: 15,
    label: 13,
    caption: 11,
  },

  font: {
    regular: "Nunito_400Regular",
    medium: "Nunito_600SemiBold",
    bold: "Nunito_700Bold",
    extra: "Nunito_800ExtraBold",

    // Fredoka — a rounded display face, for the wordmark only. Nunito is a
    // body typeface: perfectly good for text, forgettable as a logo. Note
    // setup-fonts.ts leaves any Text alone that sets fontFamily explicitly,
    // so these win over the automatic Nunito mapping.
    displayMed: "Fredoka_500Medium",
    display: "Fredoka_600SemiBold",
    displayBold: "Fredoka_700Bold",
  },

  // Soft elevation — the PDF's cards sit gently above the cream, they don't
  // float. `shadow` is kept as the default so existing screens are unchanged.
  shadow: {
    shadowColor: "#6F5A45",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  shadowSm: {
    shadowColor: "#6F5A45",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
};

// ── Category colours ───────────────────────────────────────
// Replaces the old neon set (#FF5C8A, #3E97F0, …), which fought with the
// calm palette everywhere it appeared. These are the same hues pulled toward
// clay/sage/ochre so the donut reads as one family instead of a highlighter set.
export const CATEGORY_COLORS: Record<string, string> = {
  food: "#C97B84", // dusty rose
  groceries: "#7FA87C", // sage
  transport: "#7A94AD", // slate blue
  tng: "#8F86B5", // muted violet
  shopping: "#D9A441", // ochre
  bills: "#C98A5E", // terracotta
  entertainment: "#6FA9A4", // teal
  health: "#C5664E", // clay
  education: "#7B87B8", // indigo
  zakat: "#6E9E70", // green
  savings: "#B9923F", // warm gold
  other: "#A69B8C", // warm grey
};

export const colorForCategory = (id: string) =>
  CATEGORY_COLORS[id] ?? CATEGORY_COLORS.other;
