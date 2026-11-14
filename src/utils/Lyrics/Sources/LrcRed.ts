import { SpotifyFetch } from "../../../components/Global/SpotifyFetch.ts";
import { $lrcRedAcceptModelSynced } from "../../stores.ts";
import Logger from "../../Logger.ts";
import parseTTMLToLyrics from "../ParseTTML.ts";
import { createProviderResult } from "./Shared.ts";
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
  if (text) pieces.push({ ...syllable, Text: text, IsPartOfWord: false });
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
 * lrc.red's model occasionally gives a line's final word an almost zero-length
 * window. Keep the word as one unit (it may be split across several syllables)
 * and extend only that last syllable's end so the whole final word lasts 150 ms.
 */
function fixShortModelSyncedLineEndings(lyrics: any): void {
  if (lyrics?.Type !== "Syllable" || !Array.isArray(lyrics.Content)) return;

  for (const vocal of lyrics.Content) {
    const syllables = vocal?.Lead?.Syllables;
    if (!Array.isArray(syllables) || syllables.length === 0) continue;

    const lastIndex = syllables.length - 1;
    let finalWordStartIndex = lastIndex;
    while (finalWordStartIndex > 0 && syllables[finalWordStartIndex - 1]?.IsPartOfWord) {
      finalWordStartIndex--;
    }

    const first = syllables[finalWordStartIndex];
    const last = syllables[lastIndex];
    if (typeof first?.StartTime !== "number" || typeof last?.EndTime !== "number") continue;
    if (last.EndTime - first.StartTime >= MODEL_SYNC_SHORT_FINAL_WORD_DURATION) continue;

    last.EndTime = first.StartTime + MODEL_SYNC_MIN_FINAL_WORD_DURATION;
    vocal.Lead.EndTime = last.EndTime;
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
  return createProviderResult(
    {
      ...parsed,
      source: "lrc.red",
      sourceDisplayName: byModel ? "lrc.red (model synced)" : "lrc.red",
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

export async function fetchLrcRedLyrics(trackInfo: TrackLyricsInfo): Promise<ExternalLyricsResult | null> {
  try {
    const isrc = await GetTrackIsrc(trackInfo.id);
    if (!isrc) return null;
    const ttml = await fetchTTML(isrc, false);
    if (!ttml) return null;
    if (!$lrcRedAcceptModelSynced.get() && isModelSynced(ttml)) return null;
    const lyrics = LyricsFromLrcRedTTML(ttml);
    return lyrics ? { lyrics, status: 200 } : null;
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
