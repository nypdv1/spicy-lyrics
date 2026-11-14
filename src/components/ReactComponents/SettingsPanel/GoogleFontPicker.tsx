import React from "react";

const GOOGLE_FONT_SUGGESTIONS = [
  "Albert Sans", "Archivo", "Barlow", "Bebas Neue", "Bitter", "Cabin", "Caveat", "Comfortaa", "Cormorant Garamond",
  "DM Sans", "DM Serif Display", "Dancing Script", "EB Garamond", "Exo 2", "Figtree", "Fraunces", "Inter", "Josefin Sans",
  "Karla", "Lato", "Lexend", "Libre Baskerville", "Manrope", "Merriweather", "Montserrat", "Mulish", "Noto Sans",
  "Nunito", "Open Sans", "Oswald", "Outfit", "Pacifico", "Playfair Display", "Plus Jakarta Sans", "Poppins", "PT Sans",
  "Quicksand", "Raleway", "Roboto", "Roboto Condensed", "Roboto Mono", "Rubik", "Sora", "Source Sans 3", "Space Grotesk",
  "Titillium Web", "Ubuntu", "Work Sans",
];

interface Props {
  className: string;
  disabled?: boolean;
  label: string;
  source: "google" | "system";
  value: string;
  onSourceChange: (source: "google" | "system") => void;
  onChange: (value: string) => void;
}

/** A font-source picker with a visual Google Font menu and a separate system-font field. */
export function GoogleFontPicker({ className, disabled, label, source, value, onSourceChange, onChange }: Props) {
  const options = value && !GOOGLE_FONT_SUGGESTIONS.includes(value) ? [value, ...GOOGLE_FONT_SUGGESTIONS] : GOOGLE_FONT_SUGGESTIONS;
  return <>
    <span className="sl-sp-btn-group" role="group" aria-label={`${label} source`}>
      <button className="sl-sp-btn" type="button" disabled={disabled} aria-pressed={source === "google"} onClick={() => onSourceChange("google")}>Google Fonts</button>
      <button className="sl-sp-btn" type="button" disabled={disabled} aria-pressed={source === "system"} onClick={() => onSourceChange("system")}>System Font</button>
    </span>
    {source === "google" ? (
      <select className={className} aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Choose a Google Font…</option>
        {options.map((font) => <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>{font}</option>)}
      </select>
    ) : (
      <input className={className} aria-label={label} disabled={disabled} placeholder="e.g. Spotify Mix, Arial" value={value} onChange={(event) => onChange(event.currentTarget.value)} spellCheck={false} />
    )}
  </>;
}
