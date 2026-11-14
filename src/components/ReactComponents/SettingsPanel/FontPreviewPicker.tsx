import React, { useRef } from "react";
import { openFontPicker } from "../../../utils/fontPicker.ts";

export function FontPreviewPicker({ source, value, onChange, disabled }: { source: "google" | "system"; value: string; onChange: (font: string) => void; disabled?: boolean }) {
  // Enabling Custom Font mounts this button during the toggle's pointer
  // interaction. A browser may deliver that finishing click to the fresh
  // button, opening an empty picker. Only a press that began on this button
  // itself is allowed to open it.
  const pressedHere = useRef(false);
  const label = source === "google" ? "Choose Google Font" : "Choose System Font";
  return <button
    type="button"
    className="sl-sp-btn sl-font-picker-trigger"
    disabled={disabled}
    style={value ? { fontFamily: `"${value}"` } : undefined}
    onPointerDown={() => { pressedHere.current = true; }}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") pressedHere.current = true;
    }}
    onClick={() => {
      if (!pressedHere.current) return;
      pressedHere.current = false;
      openFontPicker(source, value, onChange);
    }}
  >{value || label}</button>;
}
