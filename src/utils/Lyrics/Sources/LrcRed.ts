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

/** The parsed lyrics for one lrc.red TTML file, labelled as lrc.red (and model-synced, when it is). */
export function LyricsFromLrcRedTTML(ttml: string): any | null {
  const parsed = parseTTMLToLyrics(ttml);
  if (!parsed?.Type) return null;
  const byModel = isModelSynced(ttml);
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
