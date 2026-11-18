import { googleFontPreviewFile } from "./googleFonts.ts";

/*
 * Font picker specimens, drawn off the page. A web font that finishes loading makes the browser
 * restyle the whole document (every font on it may have changed), and Spotify's document is
 * large: scrolling the picker brought a new font in nearly every frame, and each one stalled it.
 * An installed font costs a load on the main thread the first time it's drawn, too.
 *
 * Here a worker loads each family into its own font set, which the page never sees, draws the
 * name on an OffscreenCanvas and sends the picture back. The page only ever shows images.
 */

export type Specimen = { bitmap: ImageBitmap; width: number; height: number };

type Request = {
  id: number;
  family: string;
  url: string | null;
  weight: string;
  text: string;
  fontSize: number;
  height: number;
  maxWidth: number;
  scale: number;
  targetXHeight: number;
};

const CDN_ORIGIN = "https://cdn.fonts.coollabs.io";
// A specimen's lowercase is sized to this share of its font size, so names read at one size.
const TARGET_X_HEIGHT = 0.5;
const FONT_SIZE = 15;
const HEIGHT = 28;
// Images kept while the picker is open; the oldest go first past this many. A row scrolled back
// to after its image went is drawn again in the worker, off the page.
const CACHE_LIMIT = 150;

// Runs in the worker. Self-contained: it's shipped as source text.
const WORKER_SOURCE = `
const canvas = new OffscreenCanvas(1, 1);
const ctx = canvas.getContext("2d");
// A few at a time: a fast scroll asks for dozens, and only the latest are still in view.
const MAX_RUNNING = 4;
const queue = [];
const cancelled = new Set();
let running = 0;
const pump = () => {
  while (running < MAX_RUNNING && queue.length) {
    const r = queue.shift();
    if (cancelled.delete(r.id)) continue;
    running++;
    draw(r).finally(() => { running--; pump(); });
  }
};
self.onmessage = ({ data }) => {
  if (data.cancel !== undefined) { cancelled.add(data.cancel); return; }
  queue.push(data);
  pump();
};
const draw = async (r) => {
  let face = null;
  try {
    if (r.url) {
      face = new FontFace(r.family, "url(" + r.url + ")", { weight: r.weight });
      await face.load();
      if (cancelled.delete(r.id)) return;
      self.fonts.add(face);
    }
    const fontAt = (px) => r.weight + " " + px + "px \\"" + r.family.replace(/"/g, '\\\\"') + "\\", sans-serif";
    ctx.font = fontAt(100);
    const xHeight = ctx.measureText("x").actualBoundingBoxAscent / 100;
    const fit = xHeight > 0.15 && xHeight < 0.95 ? Math.min(1.6, Math.max(0.7, r.targetXHeight / xHeight)) : 1;
    const px = r.fontSize * fit * r.scale;
    ctx.font = fontAt(px);
    const textWidth = Math.ceil(ctx.measureText(r.text).width) + 2;
    const width = Math.max(1, Math.min(textWidth, Math.round(r.maxWidth * r.scale)));
    const height = Math.round(r.height * r.scale);
    canvas.width = width;
    canvas.height = height;
    ctx.font = fontAt(px);
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(r.text, 1, height / 2);
    if (textWidth > width) {
      // Cut short: the end fades out rather than stopping at an edge.
      const fade = Math.min(width, 28 * r.scale);
      const gradient = ctx.createLinearGradient(width - fade, 0, width, 0);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = gradient;
      ctx.fillRect(width - fade, 0, fade, height);
      ctx.globalCompositeOperation = "source-over";
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id: r.id, bitmap, width: width / r.scale, height: height / r.scale }, [bitmap]);
  } catch {
    self.postMessage({ id: r.id, bitmap: null });
  } finally {
    // The picture is all that's kept; the font goes, so the worker doesn't hold every family seen.
    if (face) self.fonts.delete(face);
  }
};
`;

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const waiting = new Map<number, (specimen: Specimen | null) => void>();
const cache = new Map<string, Promise<Specimen | null>>();
// The finished ones, for a row to show at once instead of waiting a turn.
const ready = new Map<string, Specimen | null>();
// Requests still out, by key, so one scrolled past can be called off.
const pendingByKey = new Map<string, number>();

const keyFor = (family: string, source: string, maxWidth: number) =>
  `${source}:${family}:${maxWidth}:${Math.max(1, window.devicePixelRatio || 1)}`;

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = ({ data }) => {
      const resolve = waiting.get(data.id);
      waiting.delete(data.id);
      resolve?.(data.bitmap ? { bitmap: data.bitmap, width: data.width, height: data.height } : null);
    };
    worker.onerror = () => {
      for (const resolve of waiting.values()) resolve(null);
      waiting.clear();
    };
  } catch {
    workerFailed = true;
  }
  return worker;
}

/** Whether specimens can be drawn here; without a worker the picker shows plain names. */
export const SpecimensAvailable = () => !!getWorker();

/**
 * The picture of `family`'s name in its own face, about `maxWidth` CSS pixels wide at most, or
 * null when it can't be drawn. Google families load from the coolLabs CDN inside the worker;
 * installed ones are drawn by name.
 */
export function GetSpecimen(family: string, source: "google" | "system", maxWidth: number): Promise<Specimen | null> {
  const scale = Math.max(1, window.devicePixelRatio || 1);
  const key = keyFor(family, source, maxWidth);
  const known = cache.get(key);
  if (known) {
    // Most recently used goes to the back of the line.
    cache.delete(key);
    cache.set(key, known);
    return known;
  }
  const w = getWorker();
  if (!w) return Promise.resolve(null);

  let url: string | null = null;
  let weight = "400";
  if (source === "google") {
    const file = googleFontPreviewFile(family);
    weight = file.split("-")[0];
    url = `${CDN_ORIGIN}/${encodeURIComponent(family.toLowerCase().replace(/\s+/g, "-"))}/normal/${file}.woff2`;
  }
  const id = nextId++;
  const request: Request = {
    id,
    family,
    url,
    weight,
    text: family,
    fontSize: FONT_SIZE,
    height: HEIGHT,
    maxWidth,
    scale,
    targetXHeight: TARGET_X_HEIGHT,
  };
  const specimen = new Promise<Specimen | null>((resolve) => waiting.set(id, resolve)).then((result) => {
    if (pendingByKey.get(key) === id) pendingByKey.delete(key);
    if (cache.get(key) === specimen) ready.set(key, result);
    return result;
  });
  pendingByKey.set(key, id);
  w.postMessage(request);
  cache.set(key, specimen);
  TrimSpecimens(CACHE_LIMIT);
  return specimen;
}

/** Releases all but the `keep` most recently asked-for images. */
export function TrimSpecimens(keep: number): void {
  while (cache.size > keep) {
    const [oldestKey, oldest] = cache.entries().next().value as [string, Promise<Specimen | null>];
    cache.delete(oldestKey);
    ready.delete(oldestKey);
    const id = pendingByKey.get(oldestKey);
    if (id !== undefined) {
      // Not drawn yet: called off rather than left to arrive into nothing.
      pendingByKey.delete(oldestKey);
      const resolve = waiting.get(id);
      waiting.delete(id);
      resolve?.(null);
      worker?.postMessage({ cancel: id });
    }
    void oldest.then((s) => s?.bitmap.close());
  }
}

/**
 * Calls off a specimen not yet drawn, for a row scrolled out of view: it's dropped from the
 * worker's queue (or not drawn once its font arrives), and asked for again if it comes back.
 */
export function CancelSpecimen(family: string, source: "google" | "system", maxWidth: number): void {
  const key = keyFor(family, source, maxWidth);
  const id = pendingByKey.get(key);
  if (id === undefined) return;
  pendingByKey.delete(key);
  cache.delete(key);
  const resolve = waiting.get(id);
  waiting.delete(id);
  resolve?.(null);
  worker?.postMessage({ cancel: id });
}

/**
 * A finished specimen without asking for one: the picture, null when it couldn't be drawn, or
 * undefined while it's still coming (or was never asked for).
 */
export function PeekSpecimen(family: string, source: "google" | "system", maxWidth: number): Specimen | null | undefined {
  return ready.get(keyFor(family, source, maxWidth));
}
