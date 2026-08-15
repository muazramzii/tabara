import { Fragment, type ReactNode } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { theme } from "../../constants/theme";

// Kapy replies in Markdown, because that's what Gemini writes. React Native's
// <Text> has no idea what "**RM50**" means, so it renders the asterisks.
//
// This handles the small subset Kapy actually uses:
//   **bold**            → bold run
//   - item / * item     → bullet row
//   1. item             → numbered row
//
// Anything else is left alone rather than guessed at.

const BOLD = /\*\*(.+?)\*\*/g;
const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*(\d+)[.)]\s+/;

/** Splits one line into plain and bold runs. */
function inline(line: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  BOLD.lastIndex = 0;
  while ((match = BOLD.exec(line)) !== null) {
    if (match.index > last) out.push(line.slice(last, match.index));
    out.push(
      <Text key={`${keyPrefix}-b${match.index}`} style={styles.bold}>
        {match[1]}
      </Text>
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) out.push(line.slice(last));

  return out.length > 0 ? out : [line];
}

export function RichText({
  text,
  style,
  bulletColor = theme.muted,
}: {
  text: string;
  style?: TextStyle | TextStyle[];
  bulletColor?: string;
}) {
  // Collapse the 3+ blank lines models sometimes emit, then split into lines.
  const lines = text.replace(/\n{3,}/g, "\n\n").split("\n");

  return (
    <View>
      {lines.map((raw, i) => {
        // Blank line → spacer, so paragraphs keep their gap.
        if (raw.trim() === "") return <View key={i} style={styles.gap} />;

        const numbered = raw.match(NUMBERED);
        if (numbered) {
          const body = raw.replace(NUMBERED, "");
          return (
            <View key={i} style={styles.row}>
              <Text style={[style, styles.marker, { color: bulletColor }]}>
                {numbered[1]}.
              </Text>
              <Text style={[style, styles.body]}>{inline(body, `l${i}`)}</Text>
            </View>
          );
        }

        if (BULLET.test(raw)) {
          const body = raw.replace(BULLET, "");
          return (
            <View key={i} style={styles.row}>
              <Text style={[style, styles.marker, { color: bulletColor }]}>•</Text>
              <Text style={[style, styles.body]}>{inline(body, `l${i}`)}</Text>
            </View>
          );
        }

        return (
          <Text key={i} style={style}>
            {inline(raw, `l${i}`)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // fontWeight "800" is what setup-fonts.ts maps to Nunito_800ExtraBold, so
  // the bold run gets a real bold face rather than a synthesised one.
  bold: { fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "flex-start" },
  marker: { width: 18, fontWeight: "700" },
  body: { flex: 1 },
  gap: { height: 6 },
});
