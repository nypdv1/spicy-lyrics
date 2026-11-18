import { createProviderResult, buildLineLyrics, buildStaticLyrics, buildSyllableLyrics, parseTimestampToMilliseconds } from "./Shared.ts";
import { ParseLyricsfile } from "./Lyricsfile.ts";
import type { TrackLyricsInfo, ExternalLyricsResult, TimedLine } from "./Types.ts";
import { PickSearchHit } from "./SearchMatch.ts";

const LRCLIB_HEADERS = () => ({
  "x-user-agent": `spicetify v${Spicetify.Config.version} (https://github.com/spicetify/cli)`,
});

type LrclibRecord = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  // Word-timed lyrics as a Lyricsfile (YAML), when hasWordSync is set.
  hasWordSync?: boolean;
  lyricsfile?: string | null;
};

/**
 * The exact lookup wants the album too, and misses a track whose tags name another one (a local
 * file most of all). Searching by title and artist finds it; the hit must still be this song.
 */
async function searchLRCLIB(trackInfo: TrackLyricsInfo): Promise<LrclibRecord | null> {
  const url = `https://lrclib.net/api/search?${[
    ["track_name", trackInfo.title],
    ["artist_name", trackInfo.artist],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")}`;
  const response = await fetch(url, { headers: LRCLIB_HEADERS() });
  if (!response.ok) return null;
  const hits = (await response.json()) as LrclibRecord[];
  if (!Array.isArray(hits)) return null;
  return PickSearchHit(
    hits,
    trackInfo,
    (hit) => ({ title: hit.trackName ?? "", artist: hit.artistName ?? "", durationSec: hit.duration }),
    // Word timing over line timing over plain text.
    (hit) => (hit.hasWordSync && hit.lyricsfile ? 2 : hit.syncedLyrics ? 1 : 0)
  );
}

export function parseLRCLikeLyrics(text: string): {
  synced: TimedLine[] | null;
  unsynced: string[] | null;
} {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  const synced: TimedLine[] = [];
  const unsynced: string[] = [];

  rows.forEach((row) => {
    const matches = Array.from(row.matchAll(/\[([0-9:.]+)\]/g));
    const lyricText = row.replace(/\[[0-9:.]+\]/g, "").trim();

    if (!lyricText) {
      return;
    }

    if (matches.length > 0) {
      matches.forEach((match) => {
        const startTimeMs = parseTimestampToMilliseconds(match[1]);
        if (startTimeMs !== null) {
          synced.push({
            text: lyricText,
            startTimeMs,
          });
        }
      });
      return;
    }

    unsynced.push(lyricText);
  });

  return {
    synced: synced.length > 0 ? synced : null,
    unsynced: unsynced.length > 0 ? unsynced : null,
  };
}

export async function fetchLRCLIBLyrics(
  trackInfo: TrackLyricsInfo
): Promise<ExternalLyricsResult | null> {
  try {
    const finalURL = `https://lrclib.net/api/get?${[
      ["track_name", trackInfo.title],
      ["artist_name", trackInfo.artist],
      ["album_name", trackInfo.album],
      ["duration", String(trackInfo.durationMs / 1000)],
    ]
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&")}`;

    const response = await fetch(finalURL, { headers: LRCLIB_HEADERS() });

    const body: LrclibRecord | null = response.ok ? await response.json() : await searchLRCLIB(trackInfo);
    if (!body) return null;
    if (body?.instrumental) {
      const instrumentalLyrics = buildStaticLyrics(
        ["♪ Instrumental ♪"],
        "lrclib",
        "LRCLIB"
      );
      if (!instrumentalLyrics) return null;

      return createProviderResult(instrumentalLyrics, "lrclib");
    }

    // Word timing first, from the Lyricsfile; a file that can't be read falls back to the lines.
    if (body.hasWordSync && typeof body.lyricsfile === "string") {
      const wordLines = ParseLyricsfile(body.lyricsfile, trackInfo.durationMs)?.wordLines;
      const syllableLyrics = wordLines ? buildSyllableLyrics(wordLines, "lrclib", "LRCLIB") : null;
      if (syllableLyrics) {
        return createProviderResult(syllableLyrics, "lrclib");
      }
    }

    if (typeof body?.syncedLyrics === "string") {
      const parsed = parseLRCLikeLyrics(body.syncedLyrics);
      if (parsed.synced) {
        const lineLyrics = buildLineLyrics(
          parsed.synced,
          trackInfo.durationMs,
          "lrclib",
          "LRCLIB"
        );
        if (lineLyrics) {
          return createProviderResult(lineLyrics, "lrclib");
        }
      }
    }

    if (typeof body?.plainLyrics === "string") {
      const plainLines = body.plainLyrics
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean);
      const staticLyrics = buildStaticLyrics(plainLines, "lrclib", "LRCLIB");
      if (staticLyrics) {
        return createProviderResult(staticLyrics, "lrclib");
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch lyrics from LRCLIB provider:", error);
    return null;
  }
}
