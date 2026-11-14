import { toast } from "sonner";
import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import { RequestLrcRedModelSync } from "./Lyrics/Sources/LrcRed.ts";
import { ProcessLyrics } from "./Lyrics/ProcessLyrics.ts";
import { LyricsStore } from "./Lyrics/fetchLyrics.ts";
import { ApplyLyricsIfCurrent } from "./Lyrics/Global/Applyer.ts";
import { $currentLyricsData } from "./stores.ts";
import Logger from "./Logger.ts";

const syncLogger = new Logger("lrc.red sync");
let running = false;

/**
 * Asks lrc.red to sync the playing song word by word with its model, then shows the result
 * at once, whatever the source order would pick. The song's cached lyrics are dropped, so
 * later plays fetch again.
 */
export async function ModelSyncCurrentSong(): Promise<void> {
  if (running) return;
  const uri = SpotifyPlayer.GetUri();
  const id = SpotifyPlayer.GetId();
  if (!uri || !id || !uri.startsWith("spotify:track:")) {
    toast.error("Play a Spotify track to sync it on lrc.red.");
    return;
  }
  running = true;
  const name = SpotifyPlayer.GetName() ?? "this song";
  const pending = toast.loading(`Syncing "${name}" on lrc.red…`);
  try {
    const lyrics = await RequestLrcRedModelSync(id);
    await LyricsStore?.RemoveItem(id).catch(() => undefined);
    if (SpotifyPlayer.GetUri() !== uri) {
      toast.success(`"${name}" is synced on lrc.red. It shows next time it plays.`, { id: pending });
      return;
    }
    const data = { ...lyrics, id, uri };
    await ProcessLyrics(data);
    $currentLyricsData.set(JSON.stringify(data));
    await ApplyLyricsIfCurrent(uri, [data, 200]);
    toast.success(`"${name}" is now synced word by word.`, { id: pending });
  } catch (error) {
    syncLogger.warn("Model sync failed", error);
    toast.error(error instanceof Error ? error.message : "Couldn't sync this song on lrc.red.", { id: pending });
  } finally {
    running = false;
  }
}
