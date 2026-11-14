const LINK_ID = "spicy-lyrics-google-font";
const CSS_ENDPOINT = "https://api.fonts.coollabs.io/css2";

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
  link.href = `${CSS_ENDPOINT}?family=${encodeURIComponent(family.replace(/\s+/g, "+"))}&display=swap`;
  if (!existing) targetDocument.head.append(link);
}
