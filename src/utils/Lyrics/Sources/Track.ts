import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";
import type { TrackLyricsInfo } from "./Types.ts";

export function isCurrentTrack(uri: string): boolean {
  return SpotifyPlayer.GetUri() === uri;
}

function buildTrackLyricsInfo(
  uri: string,
  id: string,
  title: string,
  artist: string,
  album: string,
  durationMs: number
): TrackLyricsInfo | null {
  // A local file may have no artist tag, and name it in the title instead ("Artist - Song").
  const isLocalFile = uri.startsWith("spotify:local:");
  if (!id || !title || (!artist && !isLocalFile) || durationMs <= 0) {
    return null;
  }

  return {
    uri,
    id,
    durationMs,
    title,
    artist,
    album,
  };
}

export async function getTrackLyricsInfo(uri: string): Promise<TrackLyricsInfo | null> {
  // A local file's URI ("spotify:local:<artist>:<album>:<title>:<seconds>") has no id segment, and
  // its artist and album parts are empty when untagged; the URI itself identifies it.
  const id = uri.startsWith("spotify:local:") ? uri : (uri.split(":")[2] ?? "");
  if (!id) return null;

  if (!Spicetify.URI.isTrack(uri) && !uri.startsWith("spotify:local:")) {
    return null;
  }

  const currentUri = SpotifyPlayer.GetUri() ?? "";
  const currentId = SpotifyPlayer.GetId() ?? "";
  if (uri !== currentUri && id !== currentId) return null;

  const title = SpotifyPlayer.GetName() ?? "";
  const artist =
    SpotifyPlayer.GetArtists()
      ?.map((entry) => entry.name)
      .filter(Boolean)
      .join(", ") ?? "";
  const album = SpotifyPlayer.GetAlbumName() ?? "";
  const durationMs = SpotifyPlayer.GetDuration();

  return buildTrackLyricsInfo(uri, id, title, artist, album, durationMs);
}
