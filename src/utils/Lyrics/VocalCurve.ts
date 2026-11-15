import {
  DecodeVocalActivity,
  FetchMetadataExtension,
  MetadataExtension,
} from "../API/SpotifyMetadata.ts";

// Below this the voice detector is reading instruments (they sit around 15).
const VOCAL_FLOOR = 30;
const VOCAL_FULL = 70;
// A song with less detected singing than this is treated as having no vocal data.
const MIN_SUNG_SECONDS = 10;
// A pause is a stretch under PAUSE_CEILING that drops to PAUSE_DEPTH somewhere. Breaths
// between lines are short and often shallow (a tenth of a second, down to 40-50), so a
// low fixed cutoff misses most of them.
const PAUSE_CEILING = 65;
const PAUSE_DEPTH = 50;

/** A dip or stretch where nobody is singing. Times are in seconds. */
export type VocalPause = {
  start: number;
  end: number;
  /** Seconds of singing before the pause. */
  sung: number;
};

/**
 * Singing over time, from the client's voice detection. "Sung time" is how many
 * seconds of singing came before a moment, so it rises while someone sings and
 * holds through breaks. Lyrics spread over sung time land on the singing.
 */
export type VocalCurve = {
  /** Seconds of singing in the whole song. */
  total: number;
  /** Seconds of singing before `time`. */
  sungAt(time: number): number;
  /** The first moment `sung` seconds of singing have passed: where singing up to there stops. */
  endOf(sung: number): number;
  /** The last moment before more than `sung` seconds have passed: where the singing after it starts. */
  startOf(sung: number): number;
  /** Every pause, in order, with the silence before the first word and after the last one at the ends. */
  pauses: VocalPause[];
  /** Detector windows per second. */
  rate: number;
};

function buildCurve(offset: number, rate: number, probabilities: ArrayLike<number>): VocalCurve | null {
  const count = probabilities.length;
  const weights = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    weights[k] = Math.min(Math.max((probabilities[k] - VOCAL_FLOOR) / (VOCAL_FULL - VOCAL_FLOOR), 0), 1);
  }
  // sums[k] is the singing in windows 0..k-1, counted in windows.
  const sums = new Float64Array(count + 1);
  for (let k = 0; k < count; k++) sums[k + 1] = sums[k] + weights[k];
  const totalWindows = sums[count];
  const total = totalWindows / rate;
  if (total < MIN_SUNG_SECONDS) return null;

  const timeOf = (x: number) => offset + x / rate;

  const sungAt = (time: number) => {
    const x = (time - offset) * rate;
    if (x <= 0) return 0;
    if (x >= count) return total;
    const k = Math.floor(x);
    return (sums[k] + weights[k] * (x - k)) / rate;
  };

  // The first window whose running total passes `v` (strictly when `strict`).
  const findWindow = (v: number, strict: boolean) => {
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (strict ? sums[mid + 1] > v : sums[mid + 1] >= v) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  const endOf = (sung: number) => {
    const v = sung * rate;
    if (v <= 0) return startOf(0);
    if (v >= totalWindows) return timeOf(findWindow(totalWindows, false) + 1);
    const k = findWindow(v, false);
    return timeOf(k + (v - sums[k]) / weights[k]);
  };

  const startOf = (sung: number) => {
    const v = Math.max(0, sung * rate);
    if (v >= totalWindows) return endOf(total);
    const k = findWindow(v, true);
    return timeOf(k + (v - sums[k]) / weights[k]);
  };

  const pauses: VocalPause[] = [];
  let runStart = -1;
  let runMin = 100;
  for (let k = 0; k <= count; k++) {
    const low = k < count && probabilities[k] < PAUSE_CEILING;
    if (low) {
      if (runStart < 0) {
        runStart = k;
        runMin = 100;
      }
      runMin = Math.min(runMin, probabilities[k]);
    }
    if (!low && runStart >= 0) {
      const atEdge = runStart === 0 || k === count;
      if (atEdge || runMin <= PAUSE_DEPTH) {
        pauses.push({
          start: timeOf(runStart),
          end: timeOf(k),
          sung: (sums[runStart] + sums[k]) / 2 / rate,
        });
      }
      runStart = -1;
    }
  }
  // The ends always count as pauses, even when the singing reaches the edge.
  if (!pauses.length || pauses[0].start > offset) {
    pauses.unshift({ start: offset, end: startOf(0), sung: 0 });
  }
  if (pauses[pauses.length - 1].end < timeOf(count)) {
    pauses.push({ start: endOf(total), end: timeOf(count), sung: total });
  }
  pauses[0].sung = 0;
  pauses[pauses.length - 1].sung = total;

  return { total, sungAt, endOf, startOf, pauses, rate };
}

const curves = new Map<string, Promise<VocalCurve | null>>();

/** The vocal curve for a track, or null when Spotify has no usable voice data for it. */
export function GetVocalCurve(uri: string): Promise<VocalCurve | null> {
  if (!uri.startsWith("spotify:track:")) return Promise.resolve(null);
  const cached = curves.get(uri);
  if (cached) return cached;
  const curve = (async () => {
    const bytes = await FetchMetadataExtension(uri, MetadataExtension.VocalActivity);
    const vocals = bytes && DecodeVocalActivity(bytes);
    return vocals ? buildCurve(vocals.offset, vocals.rate, vocals.probabilities) : null;
  })().catch(() => null);
  curves.set(uri, curve);
  while (curves.size > 20) curves.delete(curves.keys().next().value as string);
  return curve;
}
