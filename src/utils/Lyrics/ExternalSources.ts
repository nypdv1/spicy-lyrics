import type { LyricsSourceProviderId } from "./LyricsSourcePreferences.ts";
import type { ExternalLyricsResult } from "./Sources/Types.ts";
import { getTrackLyricsInfo } from "./Sources/Track.ts";
import { fetchSpicyLyricsRaw, fetchSpicyLyrics, fetchAppleMusicLyrics } from "./Sources/Spicy.ts";
import { fetchMusixmatchLyrics } from "./Sources/Musixmatch.ts";
import { fetchSpotifyLyrics } from "./Sources/Spotify.ts";
import { fetchLRCLIBLyrics } from "./Sources/Lrclib.ts";
import { fetchNeteaseLyrics } from "./Sources/Netease.ts";
import { fetchLrcRedLyrics } from "./Sources/LrcRed.ts";
import { fetchUnisonLyrics } from "./Sources/Unison.ts";
import { LocalFileQueries } from "./Sources/LocalFileQuery.ts";
import type { TrackLyricsInfo } from "./Sources/Types.ts";

export { refreshMusixmatchToken } from "./Sources/Musixmatch.ts";

/**
 * Returns true if the lyrics have at least one genuine line-ending pause — a gap
 * between consecutive lines that falls within a meaningful window.
 *
 * Gaps below minGapSec are timing artifacts from back-to-back Musixmatch-sourced
 * syncs and are ignored. Gaps at or above maxGapSec are instrumental sections/tags,
 * not line pauses, and are also ignored. Only gaps strictly within the window
 * [minGapSec, maxGapSec) are counted as real Apple Music line-ending data.
 */
function _hasLineGaps(lyrics: any, minGapSec = 0.3, maxGapSec = 5.0): boolean {
  const content = Array.isArray(lyrics?.Content) ? lyrics.Content : [];
  if (content.length < 2) return false;

  for (let i = 0; i < content.length - 1; i++) {
    const current = content[i];
    const next = content[i + 1];

    // Line type stores timing directly; Syllable type nests it under Lead.
    const currentEnd =
      typeof current.EndTime === "number"
        ? current.EndTime
        : typeof current.Lead?.EndTime === "number"
          ? current.Lead.EndTime
          : null;

    const nextStart =
      typeof next.StartTime === "number"
        ? next.StartTime
        : typeof next.Lead?.StartTime === "number"
          ? next.Lead.StartTime
          : null;

    if (currentEnd === null || nextStart === null) continue;

    const gap = nextStart - currentEnd;
    if (gap >= minGapSec && gap < maxGapSec) {
      return true;
    }
  }

  return false;
}

function getLyricsTypeScore(lyrics: any): number {
  if (!lyrics || typeof lyrics !== "object") {
    return 0;
  }

  if (lyrics.Type === "Syllable") {
    return 3;
  }

  if (lyrics.Type === "Line") {
    return 2;
  }

  if (lyrics.Type === "Static") {
    return 1;
  }

  return 0;
}

const FALLBACK_PROVIDER_TIMEOUT_MS = 4000;
// getLyricsTypeScore for line- and word-timed lyrics.
const LINE_SCORE = 2;
const WORD_SCORE = 3;

/**
 * The sources that can look up a local file. A local file has no Spotify track id or ISRC, so
 * only those that search by title, artist and length can find it (lrc.red through its search,
 * Unison by title, artist and duration).
 */
export const LOCAL_FILE_SOURCES: ReadonlySet<LyricsSourceProviderId> = new Set(["musixmatch", "unison", "lrcred", "lrclib", "netease"]);

type FetchLyricsFromProvidersOptions = {
  onFirstLyrics?: (lyrics: any) => void;
};

function withProviderTimeout<T>(
  promise: Promise<T | null>,
  ms: number
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function fetchLyricsFromProviders(
  uri: string,
  order: LyricsSourceProviderId[],
  options: FetchLyricsFromProvidersOptions = {}
): Promise<ExternalLyricsResult | null> {
  const trackInfo = await getTrackLyricsInfo(uri);
  if (!trackInfo) {
    return null;
  }

  const isLocalFile = uri.startsWith("spotify:local:");
  let spicyRawPromise: Promise<ExternalLyricsResult | null> | null = null;
  const getSpicyRaw = () => {
    // A local file's "id" is part of its path, not a track Spicy Lyrics knows.
    spicyRawPromise ??= isLocalFile ? Promise.resolve(null) : fetchSpicyLyricsRaw(trackInfo.id);
    return spicyRawPromise;
  };

  function requestFrom(provider: LyricsSourceProviderId, info: TrackLyricsInfo): Promise<ExternalLyricsResult | null> {
    switch (provider) {
      case "spicy": return fetchSpicyLyrics(getSpicyRaw());
      case "musixmatch": return fetchMusixmatchLyrics(info, getSpicyRaw);
      case "apple": return fetchAppleMusicLyrics(getSpicyRaw());
      case "spotify": return fetchSpotifyLyrics(info);
      case "unison": return withProviderTimeout(fetchUnisonLyrics(info), FALLBACK_PROVIDER_TIMEOUT_MS * 2);
      case "lrcred": return withProviderTimeout(fetchLrcRedLyrics(info), FALLBACK_PROVIDER_TIMEOUT_MS * 2);
      case "lrclib": return withProviderTimeout(fetchLRCLIBLyrics(info), FALLBACK_PROVIDER_TIMEOUT_MS);
      case "netease": return withProviderTimeout(fetchNeteaseLyrics(info), FALLBACK_PROVIDER_TIMEOUT_MS);
      default: return Promise.resolve(null);
    }
  }

  // A local file's tags are loose, so each source tries the lookups LocalFileQueries guesses
  // from them, one after another, until one finds the song.
  const localQueries = isLocalFile ? LocalFileQueries(trackInfo) : [];
  async function requestLocalFile(provider: LyricsSourceProviderId): Promise<ExternalLyricsResult | null> {
    for (const query of localQueries) {
      const result = await requestFrom(provider, query).catch(() => null);
      if (result?.lyrics) return result;
    }
    return null;
  }

  function startProviderRequest(provider: LyricsSourceProviderId): Promise<ExternalLyricsResult | null> {
    if (isLocalFile) return LOCAL_FILE_SOURCES.has(provider) ? requestLocalFile(provider) : Promise.resolve(null);
    return requestFrom(provider, trackInfo);
  }

  // Start every enabled provider now. Results are still consumed in configured
  // order below, so this removes serial fallback wait without changing source
  // preference or quality selection.
  const providerRequests = new Map<
    LyricsSourceProviderId,
    Promise<ExternalLyricsResult | null>
  >();
  let firstLyricsDelivered = false;
  for (const provider of order) {
    const request = startProviderRequest(provider);
    providerRequests.set(provider, request);
    void request
      .then((result) => {
        if (firstLyricsDelivered || !result?.lyrics) return;
        firstLyricsDelivered = true;
        options.onFirstLyrics?.(result.lyrics);
      })
      .catch(() => {});
  }

  let bestResult: ExternalLyricsResult | null = null;
  let queuedResult: ExternalLyricsResult | null = null;
  let bestScore = 0;
  let hadPreferredResult = false;

  for (const provider of order) {
    // Once a preferred source (spicy/musixmatch/apple) has lyrics as well timed as a fallback
    // can offer, skip that fallback: netease times by line at best, lrclib by word (Lyricsfile).
    // Plain text from a preferred source doesn't count: a timed copy beats it.
    if (hadPreferredResult && provider === "netease" && bestScore >= LINE_SCORE) {
      continue;
    }
    if (hadPreferredResult && provider === "lrclib" && bestScore >= WORD_SCORE) {
      continue;
    }

    const result = await (providerRequests.get(provider) ?? Promise.resolve(null));

    if (result?.status === 503) queuedResult = result;
    if (!result?.lyrics) {
      continue;
    }

    const score = getLyricsTypeScore(result.lyrics);
    // Equal timing keeps the result from the earlier (higher-priority) source.
    // A later source can only upgrade the selection with a strictly better tier.
    if (score > bestScore) {
      bestResult = result;
      bestScore = score;
    }

    if (provider === "spicy" || provider === "musixmatch" || provider === "apple") {
      hadPreferredResult = true;
    }

    if (score >= 3) {
      return result;
    }
  }

  // A queue only blocks presentation when no enabled provider has usable lyrics.
  return bestResult ?? queuedResult;
}
