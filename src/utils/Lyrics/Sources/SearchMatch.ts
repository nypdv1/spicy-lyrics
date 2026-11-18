import type { TrackLyricsInfo } from "./Types.ts";

/*
 * Picking a song out of a source's search results, for tracks a source can't look up directly: a
 * local file (no Spotify id or ISRC), or a song whose tags differ from the source's (another
 * album, say). A hit counts only if its title and an artist match and its length is close, so a
 * search never hands back a different song's lyrics.
 */

export type SearchCandidate = { title: string; artist: string; durationSec?: number | null };

// The length a hit may differ by and still be the same recording.
const DURATION_TOLERANCE_SEC = 3;

/** Lower case, no accents or punctuation, without bracketed extras or a trailing "feat." part. */
export function NormalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s(?:feat|ft|featuring|with)\.?\s.*$/, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const artistsOf = (text: string) =>
  text
    .split(/,|&|\band\b|\bx\b|;|\//i)
    .map(NormalizeForMatch)
    .filter(Boolean);

function artistsMatch(wanted: string, found: string): boolean {
  const foundNorm = NormalizeForMatch(found);
  const foundArtists = artistsOf(found);
  return artistsOf(wanted).some(
    (artist) => foundArtists.includes(artist) || foundNorm.includes(artist) || artist.includes(foundNorm)
  );
}

/**
 * The hit that is this track, or null. Among several, the highest `rank` wins (say, word-timed
 * lyrics over line-timed), then the closest in length.
 */
export function PickSearchHit<T>(
  hits: readonly T[],
  track: TrackLyricsInfo,
  describe: (hit: T) => SearchCandidate,
  rank: (hit: T) => number = () => 0,
  toleranceSec: number = DURATION_TOLERANCE_SEC
): T | null {
  const title = NormalizeForMatch(track.title);
  if (!title) return null;
  const durationSec = track.durationMs / 1000;
  let best: { hit: T; diff: number; rank: number } | null = null;
  for (const hit of hits) {
    const candidate = describe(hit);
    if (NormalizeForMatch(candidate.title) !== title) continue;
    if (!artistsMatch(track.artist, candidate.artist)) continue;
    const diff =
      typeof candidate.durationSec === "number" && candidate.durationSec > 0 && durationSec > 0
        ? Math.abs(candidate.durationSec - durationSec)
        : 0;
    if (diff > toleranceSec) continue;
    const hitRank = rank(hit);
    if (!best || hitRank > best.rank || (hitRank === best.rank && diff < best.diff)) {
      best = { hit, diff, rank: hitRank };
    }
  }
  return best?.hit ?? null;
}
