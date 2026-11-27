import type { LyricsSourceProviderId } from "./LyricsSourcePreferences.ts";
import type { ExternalLyricsResult } from "./Sources/Types.ts";
import { getTrackLyricsInfo } from "./Sources/Track.ts";
import { fetchSpicyLyricsRaw, fetchSpicyLyrics, fetchAppleMusicLyrics } from "./Sources/Spicy.ts";
import { fetchMusixmatchLyrics } from "./Sources/Musixmatch.ts";
import { fetchSpotifyLyrics } from "./Sources/Spotify.ts";
import { fetchLRCLIBLyrics } from "./Sources/Lrclib.ts";
import { fetchNeteaseLyrics } from "./Sources/Netease.ts";
import { fetchLrcRedLyrics, GetTrackIsrc } from "./Sources/LrcRed.ts";
import { PickSearchHit } from "./Sources/SearchMatch.ts";
import { fetchUnisonLyrics } from "./Sources/Unison.ts";
import { LocalFileQueries } from "./Sources/LocalFileQuery.ts";
import { SpotifyFetch } from "../../components/Global/SpotifyFetch.ts";
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
  const result = await requestProviders(trackInfo, order, isLocalFile, options);
  if (result?.lyrics || isLocalFile) return result;

  // A re-delivered song gets a new track id, and the id-keyed sources then find
  // nothing. An ISRC names the recording itself, so another release carrying it
  // is the same song and its lyrics fit. Only when the first pass found nothing.
  const alternate = await requestAlternateRelease(trackInfo, order, options);
  return alternate?.lyrics ? alternate : result;
}

const ISRC_SEARCH_TIMEOUT_MS = 6000;
// How many same-ISRC releases to try, in search order.
const ISRC_ALTERNATE_LIMIT = 3;
const TRACK_METADATA_URL = (id: string) =>
  `https://spclient.wg.spotify.com/metadata/4/track/${Spicetify.URI.idToHex(id)}?market=from_token`;

/** Track ids the desktop search returns for `isrc:<isrc>`, excluding `exceptId`. */
async function searchSameIsrcTracks(isrc: string, exceptId: string): Promise<string[]> {
  const definition = (Spicetify as any).GraphQL?.Definitions?.searchModalResults;
  if (!definition) return [];
  try {
    const response = await (Spicetify as any).GraphQL.Request(definition, {
      searchTerm: `isrc:${isrc}`,
      offset: 0,
      limit: 10,
      numberOfTopResults: 10,
      includeAudiobooks: false,
      includeArtistHasConcertsField: false,
      includePreReleases: false,
      includeShows: false,
      includeAuthors: false,
    });
    const items = response?.data?.searchV2?.topResultsV2?.itemsV2 ?? [];
    const ids: string[] = [];
    for (const entry of items) {
      const uri = entry?.item?.data?.uri;
      if (entry?.item?.__typename !== "TrackResponseWrapper" || typeof uri !== "string") continue;
      const id = uri.split(":")[2];
      if (id && id !== exceptId && !ids.includes(id)) ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

// A track no longer sold in this market comes back as vnd.spotify/metadata-track
// protobuf rather than JSON, so both forms are read. Only these spotify.metadata
// Track fields are walked: name(2), album(3).name(2), artist(4).name(2),
// duration(7), external_id(10){type(1),id(2)}.
const META_FIELD_NAME = 2;
const META_FIELD_ALBUM = 3;
const META_FIELD_ARTIST = 4;
const META_FIELD_DURATION = 7;
const META_FIELD_EXTERNAL_ID = 10;

function* metadataFields(buf: Uint8Array): Generator<{ field: number; data?: Uint8Array; varint?: number }> {
  const readVarint = (pos: number): [number, number] => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = buf[pos++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
      if (!(byte & 0x80) || pos >= buf.length) return [value, pos];
    }
  };
  let pos = 0;
  while (pos < buf.length) {
    const [tag, afterTag] = readVarint(pos);
    pos = afterTag;
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (wireType === 2) {
      const [len, afterLen] = readVarint(pos);
      pos = afterLen;
      if (pos + len > buf.length) return;
      yield { field, data: buf.subarray(pos, pos + len) };
      pos += len;
    } else if (wireType === 0) {
      const [value, afterValue] = readVarint(pos);
      pos = afterValue;
      yield { field, varint: value };
    } else if (wireType === 5) {
      pos += 4;
    } else if (wireType === 1) {
      pos += 8;
    } else {
      return;
    }
  }
}

function submessageText(data: Uint8Array, field: number): string {
  for (const entry of metadataFields(data)) {
    if (entry.field === field && entry.data) return new TextDecoder().decode(entry.data);
  }
  return "";
}

type TrackMetadata = { title: string; artist: string; album: string; durationMs: number; isrcs: string[] };

function parseJsonMetadata(data: {
  name?: string;
  duration?: number;
  artist?: { name?: string }[];
  album?: { name?: string };
  external_id?: { type?: string; id?: string }[];
}): TrackMetadata {
  return {
    title: data.name ?? "",
    artist: (data.artist ?? []).map((a) => a?.name).filter(Boolean).join(", "),
    album: data.album?.name ?? "",
    durationMs: typeof data.duration === "number" ? data.duration : 0,
    isrcs: (data.external_id ?? [])
      .filter((e) => e?.type?.toLowerCase() === "isrc" && typeof e?.id === "string")
      .map((e) => e.id.toUpperCase()),
  };
}

function parseProtobufMetadata(buf: Uint8Array): TrackMetadata {
  const meta: TrackMetadata = { title: "", artist: "", album: "", durationMs: 0, isrcs: [] };
  const artists: string[] = [];
  for (const entry of metadataFields(buf)) {
    if (entry.field === META_FIELD_NAME && entry.data) {
      meta.title = new TextDecoder().decode(entry.data);
    } else if (entry.field === META_FIELD_ALBUM && entry.data && !meta.album) {
      meta.album = submessageText(entry.data, META_FIELD_NAME);
    } else if (entry.field === META_FIELD_ARTIST && entry.data) {
      const name = submessageText(entry.data, META_FIELD_NAME);
      if (name) artists.push(name);
    } else if (entry.field === META_FIELD_DURATION && typeof entry.varint === "number") {
      meta.durationMs = entry.varint;
    } else if (entry.field === META_FIELD_EXTERNAL_ID && entry.data) {
      if (submessageText(entry.data, 1).toLowerCase() === "isrc") {
        const id = submessageText(entry.data, 2);
        if (id) meta.isrcs.push(id.toUpperCase());
      }
    }
  }
  meta.artist = artists.join(", ");
  return meta;
}

/**
 * The alternate release as a TrackLyricsInfo, but only when it's really this
 * recording: the ISRC is checked when the metadata offers it (a pulled release's
 * metadata can drop the external_id entries entirely, and its duration can be
 * stale — a pulled copy was seen reporting twice the real length). With no ISRC
 * to check, a title/artist/length match stands in, on the reliable JSON form.
 * The playing track's own title, artist and length are kept: same ISRC means
 * the same recording, and the lyrics have to fit this playback.
 */
async function alternateTrackInfo(
  id: string,
  isrc: string,
  trackInfo: TrackLyricsInfo
): Promise<TrackLyricsInfo | null> {
  try {
    const res = await SpotifyFetch(TRACK_METADATA_URL(id), {
      signal: AbortSignal.timeout(ISRC_SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const isJson = (res.headers.get("content-type") ?? "").includes("json");
    const meta = isJson
      ? parseJsonMetadata(await res.json())
      : parseProtobufMetadata(new Uint8Array(await res.arrayBuffer()));
    const verified = meta.isrcs.length
      ? meta.isrcs.includes(isrc)
      : PickSearchHit([meta], trackInfo, (m) => ({
            title: m.title,
            artist: m.artist,
            durationSec: isJson ? m.durationMs / 1000 : undefined,
          })) !== null;
    if (!verified) return null;
    return {
      uri: `spotify:track:${id}`,
      id,
      title: trackInfo.title,
      artist: trackInfo.artist,
      album: trackInfo.album,
      durationMs: trackInfo.durationMs,
    };
  } catch {
    return null;
  }
}

async function requestAlternateRelease(
  trackInfo: TrackLyricsInfo,
  order: LyricsSourceProviderId[],
  options: FetchLyricsFromProvidersOptions
): Promise<ExternalLyricsResult | null> {
  try {
    const isrc = await GetTrackIsrc(trackInfo.id);
    if (!isrc) return null;

    const candidateIds = (await searchSameIsrcTracks(isrc, trackInfo.id)).slice(0, ISRC_ALTERNATE_LIMIT);
    for (const candidateId of candidateIds) {
      const alternate = await alternateTrackInfo(candidateId, isrc, trackInfo);
      if (!alternate) continue;
      const result = await requestProviders(alternate, order, false, options);
      if (result?.lyrics) {
        return {
          ...result,
          lyrics: { ...result.lyrics, resolvedViaAlternateRelease: alternate.id },
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function requestProviders(
  trackInfo: TrackLyricsInfo,
  order: LyricsSourceProviderId[],
  isLocalFile: boolean,
  options: FetchLyricsFromProvidersOptions
): Promise<ExternalLyricsResult | null> {
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
