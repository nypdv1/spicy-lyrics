import { SpotifyFetch } from "../../../components/Global/SpotifyFetch.ts";
import { $lrcRedAcceptModelSynced } from "../../stores.ts";
import Logger from "../../Logger.ts";
import parseTTMLToLyrics from "../ParseTTML.ts";
import { createProviderResult } from "./Shared.ts";
import { PickSearchHit } from "./SearchMatch.ts";
import type { ExternalLyricsResult, TrackLyricsInfo } from "./Types.ts";

const lrcRedLogger = new Logger("lrc.red");

// lrc.red serves lyrics by ISRC: /s/{isrc}.ttml, and /s/{isrc}/sync asks it to sync a song by
// model. A model-synced file says so on its root element (lrc:byModel="true").
const LRC_RED_ORIGIN = "https://lrc.red";
const TRACK_METADATA_URL = (gid: string) =>
  `https://spclient.wg.spotify.com/metadata/4/track/${gid}?market=from_token`;
const REQUEST_TIMEOUT_MS = 6000;
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

// Track id → ISRC, or null when the track has none. Kept for the session.
const isrcCache = new Map<string, string | null>();
const isrcPending = new Map<string, Promise<string | null>>();

/** The track's ISRC from Spotify's metadata, or null when it has none or the lookup failed. */
export function GetTrackIsrc(trackId: string): Promise<string | null> {
  if (isrcCache.has(trackId)) return Promise.resolve(isrcCache.get(trackId) ?? null);
  const pending = isrcPending.get(trackId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const gid = Spicetify.URI.idToHex(trackId);
      const res = await SpotifyFetch(TRACK_METADATA_URL(gid), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // Only a definite answer is cached; anything else is asked again next time.
      if (res.status === 404) {
        isrcCache.set(trackId, null);
        return null;
      }
      if (!res.ok) return null;
      const data = (await res.json()) as { external_id?: { type?: string; id?: string }[] };
      const raw = data.external_id?.find((e) => e?.type?.toLowerCase() === "isrc")?.id;
      const isrc = typeof raw === "string" && ISRC_PATTERN.test(raw.toUpperCase()) ? raw.toUpperCase() : null;
      isrcCache.set(trackId, isrc);
      return isrc;
    } catch {
      return null;
    } finally {
      isrcPending.delete(trackId);
    }
  })();
  isrcPending.set(trackId, request);
  return request;
}

const isModelSynced = (ttml: string): boolean => /<tt\b[^>]*\blrc:byModel\s*=\s*["']true["']/.test(ttml);

const MODEL_SYNC_MIN_FINAL_WORD_DURATION = 0.15;
const MODEL_SYNC_SHORT_FINAL_WORD_DURATION = 0.1;
const MODEL_SYNC_NEXT_LINE_MAX_GAP = 2;

function addLeadPiece(lead: any[], syllable: any, rawText: string): void {
  let text = rawText.trim();
  if (!text) return;
  const leadingPunctuation = text.match(/^[,.;:!?]+/);
  if (leadingPunctuation && lead.length > 0) {
    lead[lead.length - 1].Text += leadingPunctuation[0];
    text = text.slice(leadingPunctuation[0].length).trim();
    if (!text) return;
  }
  lead.push({ ...syllable, Text: text, IsPartOfWord: rawText === syllable.Text ? syllable.IsPartOfWord : false });
}

function addBackgroundPiece(pieces: any[], syllable: any, rawText: string): void {
  // Brackets and punctuation belong to the main line's grammar, not the ad-lib.
  const text = rawText.replace(/^[\s([{]+|[\s\])}.,;:!?]+$/g, "");
  // Keep a model's word-continuation timing inside the parenthetical. Previously
  // every background piece was forced apart here, so `hel` + `lo` could never
  // render as one background word. The closing bracket always ends that run.
  if (text) {
    pieces.push({
      ...syllable,
      Text: text,
      IsPartOfWord: Boolean(syllable.IsPartOfWord) && !rawText.includes(")"),
    });
  }
}

/** Moves every parenthetical model-sync ad-lib into its own background vocal group. */
function moveModelSyncedParentheticalsToBackground(lyrics: any): void {
  if (lyrics?.Type !== "Syllable" || !Array.isArray(lyrics.Content)) return;

  for (const vocal of lyrics.Content) {
    const original = vocal?.Lead?.Syllables;
    if (!Array.isArray(original) || original.length === 0) continue;

    const lead: any[] = [];
    const backgrounds: any[] = [];
    let backgroundPieces: any[] | null = null;

    for (const syllable of original) {
      let remaining = typeof syllable?.Text === "string" ? syllable.Text : "";
      while (remaining) {
        if (backgroundPieces) {
          const close = remaining.indexOf(")");
          addBackgroundPiece(backgroundPieces, syllable, close >= 0 ? remaining.slice(0, close) : remaining);
          if (close < 0) break;
          if (backgroundPieces.length > 0) {
            backgrounds.push({
              StartTime: backgroundPieces[0].StartTime,
              EndTime: backgroundPieces[backgroundPieces.length - 1].EndTime,
              Syllables: backgroundPieces,
            });
          }
          backgroundPieces = null;
          remaining = remaining.slice(close + 1);
          continue;
        }

        const open = remaining.indexOf("(");
        if (open < 0) {
          addLeadPiece(lead, syllable, remaining);
          break;
        }
        addLeadPiece(lead, syllable, remaining.slice(0, open));
        backgroundPieces = [];
        remaining = remaining.slice(open + 1);
      }
    }

    // Don't leave a line without lead text if the model supplied only an ad-lib.
    if (backgrounds.length === 0 || lead.length === 0 || backgroundPieces) continue;
    vocal.Lead.Syllables = lead;
    vocal.Lead.StartTime = lead[0].StartTime;
    vocal.Lead.EndTime = lead[lead.length - 1].EndTime;
    vocal.Background = [...(Array.isArray(vocal.Background) ? vocal.Background : []), ...backgrounds];
  }
}

/**
 * lrc.red's model occasionally gives a line's final word, or the final syllable of
 * a word sung in parts, an almost zero-length window. When the following line is
 * close, carry that final syllable through to its start; a real gap still gets the
 * conservative 150 ms fallback. Keep the word as one unit (it may be split across
 * several syllables) and extend only its final syllable.
 */
function fixShortModelSyncedLineEndings(lyrics: any): void {
  if (lyrics?.Type !== "Syllable" || !Array.isArray(lyrics.Content)) return;

  for (let lineIndex = 0; lineIndex < lyrics.Content.length; lineIndex++) {
    const vocal = lyrics.Content[lineIndex];
    const syllables = vocal?.Lead?.Syllables;
    if (!Array.isArray(syllables) || syllables.length === 0) continue;

    const lastIndex = syllables.length - 1;
    let finalWordStartIndex = lastIndex;
    while (finalWordStartIndex > 0 && syllables[finalWordStartIndex - 1]?.IsPartOfWord) {
      finalWordStartIndex--;
    }

    const first = syllables[finalWordStartIndex];
    const last = syllables[lastIndex];
    if (
      typeof first?.StartTime !== "number" ||
      typeof last?.StartTime !== "number" ||
      typeof last?.EndTime !== "number"
    ) continue;
    const wordTooShort = last.EndTime - first.StartTime < MODEL_SYNC_SHORT_FINAL_WORD_DURATION;
    // A word long enough overall can still end on a syllable that only flashes by.
    const syllableTooShort = last.EndTime - last.StartTime < MODEL_SYNC_SHORT_FINAL_WORD_DURATION;
    if (!wordTooShort && !syllableTooShort) continue;

    const nextLineStart = lyrics.Content[lineIndex + 1]?.Lead?.StartTime;
    const gapToNextLine =
      typeof nextLineStart === "number" ? nextLineStart - last.EndTime : Number.POSITIVE_INFINITY;
    const fallbackEnd = (wordTooShort ? first.StartTime : last.StartTime) + MODEL_SYNC_MIN_FINAL_WORD_DURATION;
    // Only ever lengthened.
    last.EndTime = Math.max(
      last.EndTime,
      gapToNextLine >= 0 && gapToNextLine <= MODEL_SYNC_NEXT_LINE_MAX_GAP ? nextLineStart : fallbackEnd
    );
    vocal.Lead.EndTime = Math.max(vocal.Lead.EndTime ?? last.EndTime, last.EndTime);
  }
}

/** The parsed lyrics for one lrc.red TTML file, labelled as lrc.red (and model-synced, when it is). */
export function LyricsFromLrcRedTTML(ttml: string): any | null {
  const parsed = parseTTMLToLyrics(ttml);
  if (!parsed?.Type) return null;
  const byModel = isModelSynced(ttml);
  if (byModel) {
    moveModelSyncedParentheticalsToBackground(parsed);
    fixShortModelSyncedLineEndings(parsed);
  }
  // lrc.red's hand-synced word timing is Apple Music's, so it's credited and handled as Apple
  // Music lyrics (word splitting included), shown as "Apple Music via lrc.red".
  const appleMusic = !byModel && parsed.Type === "Syllable";
  return createProviderResult(
    {
      ...parsed,
      ...(appleMusic
        ? { source: "aml", sourceDisplayName: "Apple Music", source_via: "lrc-red" }
        : { source: "lrc.red", sourceDisplayName: byModel ? "lrc.red (model synced)" : "lrc.red" }),
      lrcRedByModel: byModel,
    },
    "lrcred"
  ).lyrics;
}

async function fetchTTML(isrc: string, fresh: boolean): Promise<string | null> {
  const url = `${LRC_RED_ORIGIN}/s/${encodeURIComponent(isrc)}.ttml${fresh ? `?t=${Date.now()}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.text();
}

type LrcRedSearchHit = { isrc?: string; title?: string; artist?: string; duration?: number; byModel?: boolean };

/**
 * The ISRC of this track in lrc.red's catalogue, by searching it for the title and artist: for a
 * local file, which has none of its own, or a Spotify track whose metadata lacks one.
 */
// Another release of a song (a longer outro, an extended mix) can be off by more than the usual
// few seconds and still be timed the same. Such a hit is only taken when nothing closer is, and
// only if its lyrics end inside the track (fitsTrack).
const LOOSE_DURATION_TOLERANCE_SEC = 20;

type LrcRedSearchResult = { isrc: string; loose: boolean };

async function searchLrcRedIsrc(trackInfo: TrackLyricsInfo): Promise<LrcRedSearchResult | null> {
  // Artist and title first, then the title alone, for a song the artist's name buries in the
  // results. A hit must still name this artist (PickSearchHit), so the title alone can't match
  // a different song.
  const queries = [...new Set([`${trackInfo.artist} ${trackInfo.title}`.trim(), trackInfo.title.trim()])].filter(Boolean);
  const hitLists: LrcRedSearchHit[][] = [];
  for (const query of queries) {
    const hits = await searchLrcRed(query);
    hitLists.push(hits);
    const isrc = pickLrcRedHit(hits, trackInfo);
    if (isrc) return { isrc, loose: false };
  }
  for (const hits of hitLists) {
    const isrc = pickLrcRedHit(hits, trackInfo, LOOSE_DURATION_TOLERANCE_SEC);
    if (isrc) return { isrc, loose: true };
  }
  return null;
}

async function searchLrcRed(query: string): Promise<LrcRedSearchHit[]> {
  const res = await fetch(`${LRC_RED_ORIGIN}/search.json?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { hits?: LrcRedSearchHit[] };
  const acceptModel = $lrcRedAcceptModelSynced.get();
  return (body.hits ?? []).filter(
    (hit) => typeof hit.isrc === "string" && ISRC_PATTERN.test(hit.isrc.toUpperCase()) && (acceptModel || !hit.byModel)
  );
}

function pickLrcRedHit(hits: LrcRedSearchHit[], trackInfo: TrackLyricsInfo, toleranceSec?: number): string | null {
  const hit = PickSearchHit(
    hits,
    trackInfo,
    (h) => ({ title: h.title ?? "", artist: h.artist ?? "", durationSec: h.duration }),
    // A hand-synced file over a model's, where both are this song.
    (h) => (h.byModel ? 0 : 1),
    toleranceSec
  );
  return hit?.isrc?.toUpperCase() ?? null;
}

/** Whether the lyrics end before the track does (with a second's slack). */
function fitsTrack(lyrics: any, durationMs: number): boolean {
  const content: any[] = Array.isArray(lyrics?.Content) ? lyrics.Content : [];
  const lastEnd = Math.max(0, ...content.map((line) => line?.Lead?.EndTime ?? line?.EndTime ?? 0));
  return durationMs <= 0 || lastEnd <= durationMs / 1000 + 1;
}

export async function fetchLrcRedLyrics(trackInfo: TrackLyricsInfo): Promise<ExternalLyricsResult | null> {
  try {
    // A local file's "id" is part of its path; it has no Spotify metadata to read an ISRC from.
    const isLocalFile = trackInfo.uri.startsWith("spotify:local:");
    const acceptModel = $lrcRedAcceptModelSynced.get();
    const usable = (ttml: string | null): ttml is string => !!ttml && (acceptModel || !isModelSynced(ttml));

    // The track's own ISRC first. When lrc.red has nothing usable under it (often a different
    // release of the same song is filed under another ISRC), search by title and artist.
    const ownIsrc = isLocalFile ? null : await GetTrackIsrc(trackInfo.id);
    let ttml = ownIsrc ? await fetchTTML(ownIsrc, false) : null;
    let loose = false;
    if (!usable(ttml)) {
      const found = await searchLrcRedIsrc(trackInfo);
      loose = found?.loose ?? false;
      ttml = found && found.isrc !== ownIsrc ? await fetchTTML(found.isrc, false) : null;
    }
    if (!usable(ttml)) return null;
    const lyrics = LyricsFromLrcRedTTML(ttml);
    if (!lyrics || (loose && !fitsTrack(lyrics, trackInfo.durationMs))) return null;
    return { lyrics, status: 200 };
  } catch (error) {
    lrcRedLogger.warn("Couldn't fetch lyrics", error);
    return null;
  }
}

/**
 * Asks lrc.red to sync the song word by word with its model, then returns the new file's
 * lyrics. Throws with lrc.red's own message when it can't.
 */
export async function RequestLrcRedModelSync(trackId: string): Promise<any> {
  const isrc = await GetTrackIsrc(trackId);
  if (!isrc) throw new Error("This song has no ISRC, so lrc.red can't look it up.");
  const res = await fetch(`${LRC_RED_ORIGIN}/s/${encodeURIComponent(isrc)}/sync`, { method: "POST" });
  if (!res.ok) {
    let message = res.status === 503 ? "Syncing is not available right now." : `Could not sync (${res.status}).`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // Not JSON: keep the status message.
    }
    throw new Error(message);
  }
  const ttml = await fetchTTML(isrc, true);
  const lyrics = ttml ? LyricsFromLrcRedTTML(ttml) : null;
  if (!lyrics) throw new Error("lrc.red synced the song, but the new lyrics couldn't be read.");
  return lyrics;
}
