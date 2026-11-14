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
  value: string;
  onChange: (value: string) => void;
}

/** An editable picker: suggestions are convenient, while any Google Font family still works. */
export function GoogleFontPicker({ className, disabled, label, value, onChange }: Props) {
  return <>
    <input
      className={className}
      aria-label={label}
      disabled={disabled}
      list="spicy-lyrics-google-fonts"
      placeholder="Search Google Fonts…"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      spellCheck={false}
    />
    <datalist id="spicy-lyrics-google-fonts">
      {GOOGLE_FONT_SUGGESTIONS.map((font) => <option key={font} value={font} />)}
    </datalist>
  </>;
}
