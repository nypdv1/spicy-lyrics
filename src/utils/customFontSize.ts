import { triggerRemeasureLV } from "./Lyrics/LyricsVirtualizer.ts";

/*
 * Fonts at one font-size look different sizes: what reads as size is mostly the height of the
 * lowercase letters (the x-height), and that runs from about a third of the font-size in some
 * display and script faces to over half in others. A custom lyrics font is scaled through
 * `font-size-adjust` (default.css) so its x-height lands on the bundled font's.
 *
 * Matched exactly, a face with tiny lowercase and normal capitals would get capitals far taller
 * than the bundled font's, so the correction is held to a range: ordinary faces barely move and
 * extreme ones come most of the way.
 */

const ADJUST_VAR = "--spicy-custom-font-adjust";
const FONT_VAR = "--spicy-custom-font";
// The bundled lyrics font's x-height at the weight lines are drawn at (700), as a share of its size.
const TARGET_X_HEIGHT = 0.53;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.3;

// x-height share per family, once measured with the face itself (not a fallback) loaded.
const measured = new Map<string, number | null>();
const watchedDocuments = new WeakSet<Document>();

async function measureXHeight(targetDocument: Document, cssFontFamily: string): Promise<number | null | undefined> {
  const known = measured.get(cssFontFamily);
  if (known !== undefined) return known;
  const spec = `700 100px ${cssFontFamily}`;
  try {
    await targetDocument.fonts.load(spec, "xH");
  } catch {
    // An unknown family loads nothing; the canvas below measures whatever is drawn.
  }
  // A web font whose stylesheet hasn't arrived yet: measured later, once it has (loadingdone).
  if (!targetDocument.fonts.check(spec, "xH")) return undefined;
  const context = targetDocument.createElement("canvas").getContext("2d");
  if (!context) return null;
  context.font = spec;
  const xHeight = context.measureText("x").actualBoundingBoxAscent / 100;
  const ratio = xHeight > 0.15 && xHeight < 0.95 ? xHeight : null;
  measured.set(cssFontFamily, ratio);
  return ratio;
}

/**
 * Sets the lyrics' size correction for the custom font now on `targetDocument` (its
 * --spicy-custom-font), or clears it when there is none. Call after setting or removing that.
 */
export function SyncCustomFontSize(targetDocument: Document): void {
  const root = targetDocument.documentElement;
  const cssFontFamily = root.style.getPropertyValue(FONT_VAR).trim();
  if (!cssFontFamily) {
    if (root.style.getPropertyValue(ADJUST_VAR)) {
      root.style.removeProperty(ADJUST_VAR);
      triggerRemeasureLV();
    }
    return;
  }

  if (!watchedDocuments.has(targetDocument)) {
    watchedDocuments.add(targetDocument);
    targetDocument.fonts.addEventListener("loadingdone", () => SyncCustomFontSize(targetDocument));
  }

  void measureXHeight(targetDocument, cssFontFamily).then((xHeight) => {
    if (xHeight === undefined) return;
    // Superseded by another font while this one was measured.
    if (root.style.getPropertyValue(FONT_VAR).trim() !== cssFontFamily) return;
    const next = xHeight === null
      ? ""
      : (xHeight * Math.min(MAX_SCALE, Math.max(MIN_SCALE, TARGET_X_HEIGHT / xHeight))).toFixed(3);
    if (root.style.getPropertyValue(ADJUST_VAR) === next) return;
    if (next) root.style.setProperty(ADJUST_VAR, next);
    else root.style.removeProperty(ADJUST_VAR);
    // Line heights change with the size; the virtualizer measures them again.
    triggerRemeasureLV();
  });
}
