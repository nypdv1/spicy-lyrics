import React from "react";
import { openFontPicker } from "../../../utils/fontPicker.ts";

export function FontPreviewPicker({ source, value, onChange, disabled }: { source: "google" | "system"; value: string; onChange: (font: string) => void; disabled?: boolean }) {
  const label = source === "google" ? "Choose Google Font" : "Choose System Font";
  return <button type="button" className="sl-sp-btn sl-font-picker-trigger" disabled={disabled} style={value ? { fontFamily: `"${value}"` } : undefined} onClick={() => openFontPicker(source, value, onChange)}>{value || label}</button>;
}
