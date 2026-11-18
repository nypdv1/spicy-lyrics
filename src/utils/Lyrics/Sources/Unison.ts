import Logger from "../../Logger.ts";
import parseTTMLToLyrics from "../ParseTTML.ts";
import { GetTrackIsrc } from "./LrcRed.ts";
import { parseLRCLikeLyrics } from "./Lrclib.ts";
import { buildLineLyrics, buildStaticLyrics, createProviderResult, removeSongFeat } from "./Shared.ts";
import type { ExternalLyricsResult, TrackLyricsInfo } from "./Types.ts";
import { MainArtist, StripTitleExtras } from "./LocalFileQuery.ts";
import { NormalizeForMatch, PickSearchHit } from "./SearchMatch.ts";

const unisonLogger = new Logger("Unison");

// Unison (unison.betterlyrics.org/docs): community-synced lyrics, no key. Looked up by ISRC, with
// the title and artist sent too so an ISRC it doesn't know falls back to them. Its Spotify-id
// lookup answers 503 while it matches a new id, so the ISRC Spotify's metadata gives is used.
export const UNISON_ORIGIN = "https://unison.betterlyrics.org";
const REQUEST_TIMEOUT_MS = 6000;

export type UnisonSubmitter = {
  keyId: string;
  displayName: string;
  avatarUrl?: string;
};

/** What the credits need to name Unison and the submitter, as its attribution terms ask. */
export type UnisonCredit = {
  songUrl: string;
  submitter?: UnisonSubmitter & { profileUrl: string };
};

type UnisonRecord = {
  videoId?: string;
  lyrics?: string;
  format?: "ttml" | "lrc" | "plain";
  submitter?: { keyId?: string; displayName?: string; avatarUrl?: string } | null;
};

export const unisonProfileUrl = (keyId: string) => `${UNISON_ORIGIN}/curator/${encodeURIComponent(keyId)}`;

function creditFor(record: UnisonRecord): UnisonCredit {
  const songUrl = record.videoId
    ? `${UNISON_ORIGIN}/song/${encodeURIComponent(record.videoId)}`
    : UNISON_ORIGIN;
  const submitter = record.submitter;
  if (!submitter?.keyId || !submitter.displayName) return { songUrl };
  return {
    songUrl,
    submitter: {
      keyId: submitter.keyId,
      displayName: submitter.displayName,
      avatarUrl: typeof submitter.avatarUrl === "string" ? submitter.avatarUrl : undefined,
      profileUrl: unisonProfileUrl(submitter.keyId),
    },
  };
}

function lyricsFromRecord(record: UnisonRecord, trackInfo: TrackLyricsInfo): any | null {
  const text = record.lyrics;
  if (typeof text !== "string" || !text.trim()) return null;
  if (record.format === "ttml") return parseTTMLToLyrics(text);
  if (record.format === "lrc") {
    const parsed = parseLRCLikeLyrics(text);
    if (parsed.synced) return buildLineLyrics(parsed.synced, trackInfo.durationMs, "unison");
    if (parsed.unsynced) return buildStaticLyrics(parsed.unsynced, "unison");
    return null;
  }
  return buildStaticLyrics(text.split(/\r?\n/), "unison");
}

async function getRecord(query: string): Promise<UnisonRecord | null> {
  const res = await fetch(`${UNISON_ORIGIN}/lyrics?${query}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return null;
  const body = (await res.json()) as { success?: boolean; data?: UnisonRecord };
  return body?.success && body.data ? body.data : null;
}

type UnisonSearchHit = { videoId?: string; song?: string; artist?: string; duration?: number };

/**
 * A Unison entry's title is often its YouTube video's, artist included ("BABYMAN - OI") and with
 * extras ("(Official Video)"), so the exact song lookup misses it. The song part of such a title.
 */
function songPartOf(title: string, artist: string): string {
  const stripped = StripTitleExtras(title);
  const parts = stripped.split(/\s+[-–—]\s+/);
  if (parts.length !== 2) return stripped;
  const wanted = NormalizeForMatch(MainArtist(artist));
  const [left, right] = parts;
  if (wanted && NormalizeForMatch(left).includes(wanted)) return right;
  if (wanted && NormalizeForMatch(right).includes(wanted)) return left;
  return stripped;
}

/** Searches Unison for the song and returns the hit that is it, matched on title, artist and length. */
async function searchRecord(trackInfo: TrackLyricsInfo, artist: string): Promise<UnisonRecord | null> {
  const q = `${artist} ${StripTitleExtras(trackInfo.title)}`.trim();
  const res = await fetch(`${UNISON_ORIGIN}/lyrics/search?q=${encodeURIComponent(q)}&limit=10`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { success?: boolean; data?: UnisonSearchHit[] };
  const hits = Array.isArray(body?.data) ? body.data.filter((hit) => hit.videoId) : [];
  const hit = PickSearchHit(
    hits,
    { ...trackInfo, title: StripTitleExtras(trackInfo.title), artist },
    (h) => ({ title: songPartOf(h.song ?? "", h.artist ?? artist), artist: h.artist ?? "", durationSec: h.duration })
  );
  return hit?.videoId ? getRecord(`v=${encodeURIComponent(hit.videoId)}`) : null;
}

export async function fetchUnisonLyrics(trackInfo: TrackLyricsInfo): Promise<ExternalLyricsResult | null> {
  try {
    const isLocalFile = trackInfo.uri.startsWith("spotify:local:");
    const isrc = isLocalFile ? null : await GetTrackIsrc(trackInfo.id);
    // Matching needs only one credited name, and the main artist is the likeliest to be there.
    const artist = MainArtist(trackInfo.artist);
    const params = new URLSearchParams();
    if (isrc) params.set("isrc", isrc);
    params.set("song", removeSongFeat(trackInfo.title));
    params.set("artist", artist);
    if (!isrc) params.set("duration", String(Math.round(trackInfo.durationMs / 1000)));

    // The exact lookup first, then a search for entries titled the YouTube way.
    const record = (await getRecord(params.toString())) ?? (await searchRecord(trackInfo, artist));
    if (!record) return null;

    const parsed = lyricsFromRecord(record, trackInfo);
    if (!parsed?.Type) return null;
    return createProviderResult(
      {
        ...parsed,
        source: "unison",
        sourceDisplayName: "Unison",
        unisonCredit: creditFor(record),
      },
      "unison"
    );
  } catch (error) {
    unisonLogger.warn("Couldn't fetch lyrics", error);
    return null;
  }
}
