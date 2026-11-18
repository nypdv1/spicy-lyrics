import { googleFontPreviewFile } from "./googleFonts.ts";

const LINK_ID = "spicy-lyrics-google-font";
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

// Each document's specimen families, settled once the family can be drawn.
const previewed = new WeakMap<Document, Map<string, Promise<void>>>();
// A family that never arrives still settles, so nothing waits on it for good.
const PREVIEW_TIMEOUT_MS = 8000;
const CDN_ORIGIN = "https://cdn.fonts.coollabs.io";
// What Google Fonts' "latin" files cover.
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

/**
 * Loads one family for the font pickers' specimens, once per document. A stylesheet per family
 * rather than one for the list: the catalog runs to nearly 2,000 families, too many for one
 * request, and only the ones scrolled past are ever drawn. Kept for the session, so a family
 * shown before draws at once the next time. Resolves once the family's face has loaded (or
 * failed, or taken too long), for a picker to show it as loading until then.
 */
export function loadCoollabsFontPreview(fontFamily: string, targetDocument: Document = document): Promise<void> {
  const family = fontFamily.trim().replace(/[\r\n\t]/g, " ");
  if (!family) return Promise.resolve();
  let loaded = previewed.get(targetDocument);
  if (!loaded) {
    loaded = new Map();
    previewed.set(targetDocument, loaded);
  }
  const known = loaded.get(family);
  if (known) return known;
  // One file, added as a FontFace. A <link> per family made the browser restyle the whole page
  // as each arrived, once a frame while the picker filled in. The file is the family's regular
  // Latin cut (or the nearest it has), straight from the coolLabs CDN, whose files allow
  // cross-origin use where its CSS endpoint doesn't.
  const view = (targetDocument.defaultView ?? window) as Window & typeof globalThis;
  const file = googleFontPreviewFile(family);
  const slug = family.toLowerCase().replace(/\s+/g, "-");
  const latin = file.endsWith("-latin");
  const face = new view.FontFace(family, `url(${CDN_ORIGIN}/${encodeURIComponent(slug)}/normal/${file}.woff2)`, {
    weight: file.split("-")[0],
    display: "swap",
    // Kept to the characters it holds, so a family later chosen for the lyrics still takes its
    // other scripts from the full stylesheet rather than from this cut.
    ...(latin ? { unicodeRange: LATIN_RANGE } : {}),
  });
  targetDocument.fonts.add(face);
  const settled = Promise.race([
    face.load().then(() => undefined, () => undefined),
    new Promise<void>((resolve) => view.setTimeout(resolve, PREVIEW_TIMEOUT_MS)),
  ]);
  loaded.set(family, settled);
  return settled;
}
