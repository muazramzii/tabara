import React from "react";
import { StyleSheet, Text, TextInput } from "react-native";

// Maps fontWeight → the matching Nunito font file
const FAMILY: Record<string, string> = {
  "400": "Nunito_400Regular",
  normal: "Nunito_400Regular",
  "500": "Nunito_500Medium",
  "600": "Nunito_600SemiBold",
  "700": "Nunito_700Bold",
  bold: "Nunito_700Bold",
  "800": "Nunito_800ExtraBold",
  "900": "Nunito_800ExtraBold",
};

const familyFor = (weight?: string | number) =>
  FAMILY[String(weight ?? "400")] ?? "Nunito_400Regular";

function patch(Comp: any) {
  if (!Comp || Comp.__nunito || typeof Comp.render !== "function") return;
  const oldRender = Comp.render;
  Comp.render = function (...args: any[]) {
    const origin = oldRender.apply(this, args);
    if (!React.isValidElement(origin)) return origin;
    const flat = StyleSheet.flatten((origin as any).props?.style) || {};
    if (flat.fontFamily) return origin; // respect any explicit font
    return React.cloneElement(origin as any, {
      style: [{ fontFamily: familyFor(flat.fontWeight) }, (origin as any).props.style],
    });
  };
  Comp.__nunito = true;
}

// Makes ALL <Text>/<TextInput> use Nunito, picking the right weight automatically.
export function setupFonts() {
  patch(Text);
  patch(TextInput);
}