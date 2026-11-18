import { toast } from "sonner";
import { dbPromise } from "./db";
import { LocalLyricsManager } from "./Lyrics/manager";
import { openSettingsPanel } from "./settings";
import { OpenLyricsDBPanel } from "./openLyricsDBPanel";
import { DeepFreeze } from "./utils";
import { triggerSpicyLyricsFakeUpdate } from "./version/CheckForUpdates";
import { BreakerDebug } from "./API/CircuitBreaker";
import { RemoteConfigDebug } from "./remoteConfig";
import { showUpdatedDialog } from "../components/ReactComponents/UpdateDialog.tsx";
import GetProgress from "./Gets/GetProgress";
import ApplyLyrics, { GetLastWordSync } from "./Lyrics/Global/Applyer.ts";
import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import { getBackgroundMotionState } from "../components/DynamicBG/dynamicBackground.ts";
import { ForceNextUp } from "../components/Utils/NextUp.ts";
import { GetVocalCurve } from "./Lyrics/VocalCurve.ts";
import { showProfileModal } from "../components/ReactComponents/ProfileCard/ProfileCardModal.tsx";

export function exposeToWindow() {
    const api = {
        panels: {
            settings: {
                open: () => openSettingsPanel(),
            },
            lyricsDB: {
                open: () => OpenLyricsDBPanel(),
            },
        },
        db: {
            dbPromise: dbPromise,
            objectStores: {
                lyricsStore: {
                    manager: LocalLyricsManager,
                }
            }
        },
        constants: {
            toaster: toast,
        },
        testing: {
            toaster: toast,
            // Escape hatch: a bad persisted breaker state would otherwise mean
            // telling users to clear localStorage by hand.
            breaker: BreakerDebug,
            autoUpdate: {
                triggerFakeUpdate: triggerSpicyLyricsFakeUpdate,
                showUpdatedDialog: (fromVersion: string, toVersion: string) => showUpdatedDialog(fromVersion, toVersion),
            },
            getProgress: () => GetProgress(),
            backgroundMotion: () => getBackgroundMotionState(),
            // Show Up Next now with a stand-in track, e.g. nextUp({ title, artist, image }); nextUp() undoes it.
            nextUp: (track?: { title?: string; artist?: string; image?: string | null } | null) => ForceNextUp(track),
            // Paint a notice over the current track, e.g. showLyricsNotice("status-not-200", 500).
            showLyricsNotice: (descriptor: string, status: number = 0) =>
                ApplyLyrics([descriptor, status, SpotifyPlayer.GetUri()]),
            // The singing curve word sync goes by, e.g. vocalCurve() for the current track.
            vocalCurve: (uri: string = SpotifyPlayer.GetUri() ?? "") => GetVocalCurve(uri),
            // What Experimental Word Sync did on the last apply: source type, timing used, voice data.
            wordSync: () => GetLastWordSync(),
            // Open a contributor's profile card by their user id; resolves with how it went.
            profileCard: (userId: string) =>
                new Promise<string>((resolve) => {
                    showProfileModal(userId, document, {
                        signal: new AbortController().signal,
                        onState: (state) => { if (state !== "loading") resolve(state); },
                    });
                }),
        },
        request: {
            QueryAPI: {
                breaker: BreakerDebug,
            },
            remoteConfig: RemoteConfigDebug,
        }
    };

    (window as any).SpicyLyrics = DeepFreeze(api);
}
