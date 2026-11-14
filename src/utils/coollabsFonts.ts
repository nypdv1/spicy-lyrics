const LINK_ID = "spicy-lyrics-google-font";
const PREVIEW_LINK_ID = "spicy-lyrics-google-font-preview";
const CSS_ENDPOINT = "https://api.fonts.coollabs.io/css2";
// css2 expects spaces as literal query `+` separators. Encoding a `+` as `%2B`
// makes coolLabs register e.g. `DM+Sans`, which cannot match `font-family: DM Sans`.
const encodeFamily = (family: string) => encodeURIComponent(family).replace(/%20/g, "+");

/** Loads the selected Google Font through coolLabs' privacy-friendly CSS API. */
export function loadCoollabsFont(fontFamily: string, targetDocument: Document = document): void {
  const family = fontFamily.trim().replace(/[\r\n\t]/g, " ");
  const existing = targetDocument.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!family) {
    existing?.remove();
    return;
  }

  const link = existing ?? targetDocument.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.type = "text/css";
  // Request the family without a fixed weight range: some Google Fonts only ship
  // one weight, while CSS can safely synthesize the extra lyric weights if needed.
  link.href = `${CSS_ENDPOINT}?family=${encodeFamily(family)}&display=swap`;
  if (!existing) targetDocument.head.append(link);
}

/** Loads a temporary family set for the font-picker specimens. */
export function loadCoollabsFontPreviews(fontFamilies: readonly string[], targetDocument: Document = document): () => void {
  const existing = targetDocument.getElementById(PREVIEW_LINK_ID) as HTMLLinkElement | null;
  existing?.remove();
  const families = [...new Set(fontFamilies.map((font) => font.trim()).filter(Boolean))];
  if (!families.length) return () => {};
  const link = targetDocument.createElement("link");
  link.id = PREVIEW_LINK_ID;
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = `${CSS_ENDPOINT}?${families.map((family) => `family=${encodeFamily(family)}`).join("&")}&display=swap`;
  targetDocument.head.append(link);
  return () => link.remove();
}
