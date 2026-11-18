import { NormalizeForMatch } from "./SearchMatch.ts";
import type { TrackLyricsInfo } from "./Types.ts";

/*
 * The lookups to try for a local file, best guess first. Local tags are often loose: a SoundCloud
 * download names the uploader as the artist and puts "Artist - Song" (or "Song - Artist") in the
 * title, artists come joined with "&", "x" or "feat.", and titles carry "(Official Video)" or
 * "[prod. …]". Each source tries these in turn until one finds the song; its own match check
 * (title, artist and length) still decides whether a hit is this song.
 */

const MAX_ATTEMPTS = 6;

// Between artists. " x " and " vs " only with spaces around them, so names keep their letters.
const ARTIST_DELIMITERS = /\s*(?:,|&|;|\/|\+|\s(?:x|vs\.?|feat\.?|ft\.?|featuring|with|and)\s)\s*/i;
// "Artist - Song", with a hyphen or a dash and spaces around it.
const TITLE_SPLIT = /\s+[-–—]\s+/;

/** The first-credited artist, or the whole string when splitting leaves nothing. */
export function MainArtist(artist: string): string {
  const main = artist.split(ARTIST_DELIMITERS)[0]?.trim();
  return main || artist.trim();
}

/** Without bracketed extras or a trailing "feat. …" / "prod. …" part. */
export function StripTitleExtras(title: string): string {
  const stripped = title
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|【[^】]*】/g, " ")
    .replace(/\s(?:feat|ft|featuring|prod)\.?\s.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || title.trim();
}

export function LocalFileQueries(track: TrackLyricsInfo): TrackLyricsInfo[] {
  const queries: TrackLyricsInfo[] = [];
  const seen = new Set<string>();
  const add = (title: string, artist: string) => {
    const t = title.trim();
    const a = artist.trim();
    if (!t || !a) return;
    // Raw text, not NormalizeForMatch: that drops brackets, and the stripped title is a new query.
    const key = `${t.toLowerCase()}|${a.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ ...track, title: t, artist: a });
  };
  // The tags as they are first.
  add(track.title, track.artist);

  // Then a title that names the artist too. Its parts are already without bracketed extras.
  const parts = StripTitleExtras(track.title).split(TITLE_SPLIT);
  if (parts.length === 2) {
    const [left, right] = parts.map((part) => part.trim());
    const tagged = NormalizeForMatch(MainArtist(track.artist));
    if (tagged && NormalizeForMatch(MainArtist(left)) === tagged) {
      add(right, MainArtist(left));
    } else if (tagged && NormalizeForMatch(MainArtist(right)) === tagged) {
      add(left, MainArtist(right));
    } else {
      // "Artist - Song" is the more common way round.
      add(right, MainArtist(left));
      add(left, MainArtist(right));
    }
  }

  // Then the tags loosened: the main artist only, then the title without its extras too.
  add(track.title, MainArtist(track.artist));
  add(StripTitleExtras(track.title), MainArtist(track.artist));
  add(StripTitleExtras(track.title), track.artist);

  return queries.slice(0, MAX_ATTEMPTS);
}
