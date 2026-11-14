import { toast } from "sonner";
import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import { RequestLrcRedModelSync } from "./Lyrics/Sources/LrcRed.ts";
import fetchLyrics, { LyricsStore } from "./Lyrics/fetchLyrics.ts";
import { ApplyLyricsIfCurrent } from "./Lyrics/Global/Applyer.ts";
import { $currentLyricsData } from "./stores.ts";
import Logger from "./Logger.ts";

const syncLogger = new Logger("lrc.red sync");
let running = false;

/**
 * Asks lrc.red to sync the playing song word by word, then refetches through the normal
 * source-selection pipeline. This preserves source order while still allowing a better
 * lower-priority sync to replace a worse one.
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
    await RequestLrcRedModelSync(id);
    await LyricsStore?.RemoveItem(id).catch(() => undefined);
    $currentLyricsData.set("");
    if (SpotifyPlayer.GetUri() !== uri) {
      toast.success(`"${name}" is synced on lrc.red. It shows next time it plays.`, { id: pending });
      return;
    }
    const selectedLyrics = await fetchLyrics(uri);
    await ApplyLyricsIfCurrent(uri, selectedLyrics);
    toast.success(`"${name}" is synced on lrc.red.`, { id: pending });
  } catch (error) {
    syncLogger.warn("Model sync failed", error);
    toast.error(error instanceof Error ? error.message : "Couldn't sync this song on lrc.red.", { id: pending });
  } finally {
    running = false;
  }
}
