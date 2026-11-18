import { IsCardMode, PageContainer } from "../../components/Pages/PageView.ts";
import { IsCompactMode } from "../../components/Utils/CompactMode.ts";
import Fullscreen from "../../components/Utils/Fullscreen.ts";
import { SyncNowBarSide } from "../../components/Utils/NowBar.ts";
import { BuildBugReport, CopyText, DISCORD_INVITE_URL } from "../BugReport.ts";
import { IsQueueOpen, SyncAutoQueue } from "../../components/Utils/QueueView.ts";
import { $autoQueueWhenNoLyrics, $popupCoverWhenNoLyrics, $popupShowsCover, $showNoLyricsNotice } from "../stores.ts";
import Global from "../../components/Global/Global.ts";
import { IsPIP } from "../../components/Utils/PopupLyrics.ts";
import { $experiment, isExperimentEnabled } from "../experiments.ts";

type NoticeCopy = {
  title: string;
  body: string;
  /** Offer "Try again": the cause is temporary and a refetch can clear it. */
  retry?: boolean;
  /**
   * Offer "Copy details". Only where a report tells us something; states that
   * are working as designed (DJ, podcasts, local files...) would just be noise.
   */
  report?: boolean;
};

const NOTICES: Record<string, NoticeCopy> = {
  "lyrics-not-found": {
    title: "No lyrics for this song yet",
    body: "We couldn't find lyrics for this track in any of our sources. New lyrics are added all the time, so check back later. If you know this song has lyrics, copy the details and send them to us so we can look into it.",
    report: true,
  },
  "dj": {
    title: "Lyrics aren't available with the DJ",
    body: "The DJ mixes songs and voiceovers together, so there's nothing for us to line lyrics up with. Play a song directly to see its lyrics.",
  },
  "ad": {
    title: "An ad is playing",
    body: "Lyrics come back when a song is playing.",
  },
  "unknown-track": {
    title: "We couldn't read this track",
    body: "Spotify didn't tell us what's playing, so we don't know which lyrics to look up. Skipping to the next song and back usually fixes this.",
    report: true,
  },
  "unknown-error": {
    title: "Something went wrong",
    body: "An unexpected error stopped the lyrics from loading. Try again, and if it keeps happening, copy the details and send them to us on Discord.",
    retry: true,
    report: true,
  },
  "offline": {
    title: "You're offline",
    body: "Lyrics need an internet connection the first time you play a song. Songs you've played recently still have theirs saved. Reconnect and try again.",
    retry: true,
  },
  "service-unavailable": {
    title: "Lyrics are temporarily unavailable",
    body: "Our lyrics service isn't responding right now. Nothing is wrong on your end. Give it a minute and try again.",
    retry: true,
    report: true,
  },
  "rate-limited": {
    title: "Slow down a little",
    body: "Lots of songs were requested in a short time, so we're holding off for a moment. Wait a few seconds and try again.",
    retry: true,
    report: true,
  },
  "status-not-200": {
    title: "The lyrics server ran into a problem",
    body: "Our server returned an error for this song. Try again in a moment. If it keeps happening, copy the details and send them to us on Discord.",
    retry: true,
    report: true,
  },
  "video-track": {
    title: "Music video lyrics aren't supported yet",
    body: "Lyrics only work on regular audio tracks for now. Switch this song to its audio version to see them.",
  },
  "episode-track": {
    title: "Podcast episodes don't have lyrics",
    body: "Spicy Lyrics only shows lyrics for songs. Podcast episodes aren't supported.",
  },
  "mixed-track": {
    title: "Video podcasts don't have lyrics",
    body: "Spicy Lyrics only shows lyrics for songs. Video podcast episodes aren't supported.",
  },
  "local-track": {
    title: "No lyrics found for this file",
    body: "Files on your computer are looked up by their title, artist and length, and no lyrics source had a match for this one. Check that the file's title and artist tags are right, or add your own lyrics for it as a TTML file from the Local Lyrics DB.",
  },
};

export function HasNotice(descriptor: string): boolean {
  return Object.hasOwn(NOTICES, descriptor);
}

/**
 * The notices that only say the song has no lyrics, with nothing to retry.
 * Turning off `$showNoLyricsNotice` hides these; errors keep theirs.
 */
const NO_LYRICS_NOTICES = new Set([
  "lyrics-not-found",
  "local-track",
  "dj",
  "ad",
  "video-track",
  "episode-track",
  "mixed-track",
]);

// The notice the lyrics area holds, or null while it holds lyrics (or a loader).
let shownNotice: string | null = null;

export function SetShownNotice(descriptor: string | null): void {
  shownNotice = descriptor;
}

/**
 * The popup shows the album cover where the lyrics would be. The Popup Player Dock lays the
 * cover out across the window (PopupDock.css, .LyricsHidden); without the dock there's no
 * such layout, so the lyrics stay.
 */
export function PopupShowsCover(): boolean {
  return IsPIP && $popupShowsCover.get() && isExperimentEnabled("popupDock");
}

/**
 * The full-window cover is up: chosen over the lyrics (PopupShowsCover), or standing in for a song
 * with no lyrics (Album Cover When a Song Has No Lyrics). The second lasts only while that notice
 * would show, so the next song's lyrics, and its loader before them, come back on their own.
 */
export function PopupCoverActive(): boolean {
  if (PopupShowsCover()) return true;
  return (
    IsPIP &&
    isExperimentEnabled("popupDock") &&
    $popupCoverWhenNoLyrics.get() &&
    !!shownNotice &&
    NO_LYRICS_NOTICES.has(shownNotice) &&
    !IsQueueOpen()
  );
}

// Whether the cover was up at the last layout pass, so the artwork is placed again when it changes.
let coverWasActive = false;

function shouldHideLyricsArea(): boolean {
  if (!PageContainer) return false;
  // The open queue takes the lyrics column, so the column stays.
  if (IsQueueOpen()) return false;
  // The NPV card has its own switch (Hide When a Song Has No Lyrics), which removes it.
  if (IsCardMode) return false;
  if (PopupCoverActive()) return true;
  if (!shownNotice) return false;
  if (!$showNoLyricsNotice.get() && NO_LYRICS_NOTICES.has(shownNotice)) return true;
  // Fullscreen, Cinema View and the popup show the song on its own instead of the
  // notice. Compact mode keeps the notice: the song info is already beside it.
  return (
    (shownNotice === "lyrics-not-found" || shownNotice === "local-track") &&
    !IsCompactMode() &&
    (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen)
  );
}

/**
 * Hides or reveals the lyrics area for the notice it holds. The single place that
 * decides it: call after anything that changes the notice, compact mode, fullscreen
 * or the setting.
 */
export function SyncNoLyricsLayout(): void {
  const page = PageContainer;
  if (!page) return;
  const hide = shouldHideLyricsArea();
  page.querySelector(".ContentBox .LyricsContainer")?.classList.toggle("Hidden", hide);
  page.querySelector(".ContentBox")?.classList.toggle("LyricsHidden", hide);
  // The cover chosen over the lyrics fills the whole popup (PopupDock.css); a song that simply has
  // no lyrics keeps the framed cover above the dock.
  const coverActive = hide && PopupCoverActive();
  page.classList.toggle("PopupCoverMode", coverActive);
  // The motion artwork or Canvas follows the cover in and out (GetArtworkPlacement).
  if (coverActive !== coverWasActive) {
    coverWasActive = coverActive;
    queueMicrotask(() => Global.Event.evoke("canvas-stage:change", null));
  }
  SyncNowBarSide();
  // After this pass: opening or closing the queue runs SyncNoLyricsLayout again.
  const noLyrics = !!shownNotice && NO_LYRICS_NOTICES.has(shownNotice);
  queueMicrotask(() => SyncAutoQueue(noLyrics));
}

$showNoLyricsNotice.listen(() => queueMicrotask(SyncNoLyricsLayout));
$popupShowsCover.listen(() => queueMicrotask(SyncNoLyricsLayout));
$popupCoverWhenNoLyrics.listen(() => queueMicrotask(SyncNoLyricsLayout));
$experiment("popupDock").listen(() => queueMicrotask(SyncNoLyricsLayout));
$autoQueueWhenNoLyrics.listen(() => queueMicrotask(SyncNoLyricsLayout));

const ICONS = {
  copy: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="5.25" width="8" height="8" rx="2"/><path d="M10.75 5.25V4.5a1.75 1.75 0 0 0-1.75-1.75H4.5A1.75 1.75 0 0 0 2.75 4.5V9a1.75 1.75 0 0 0 1.75 1.75h.75"/></svg>`,
  check: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.25 8.5l3 3 6.5-7" pathLength="1"/></svg>`,
  retry: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71"/><path d="M13.25 2.75v3h-3"/></svg>`,
  chat: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.75 4.5c0-.97.78-1.75 1.75-1.75h7c.97 0 1.75.78 1.75 1.75v5c0 .97-.78 1.75-1.75 1.75H7l-3 2.5v-2.5h.5a1.75 1.75 0 0 1-1.75-1.75z"/></svg>`,
};

function makeButton(icon: string, label: string, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "notice-action notice-action-primary" : "notice-action";
  button.innerHTML = icon;
  const text = document.createElement("span");
  text.textContent = label;
  button.appendChild(text);
  return button;
}

/**
 * "Copy details" keeps one icon + label face per state in the DOM, stacked in
 * one grid cell, and swaps them by `data-state` so the change can crossfade.
 * The cell is as wide as the widest face, so the row doesn't shift when the
 * text changes.
 */
function makeCopyButton(primary: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `notice-action notice-copy${primary ? " notice-action-primary" : ""}`;
  button.dataset.state = "idle";
  const face = (state: string, icon: string, label: string) =>
    `<span class="notice-face" data-for="${state}">${icon}<span>${label}</span></span>`;
  button.innerHTML =
    `<span class="notice-swap" aria-live="polite">` +
    face("idle", ICONS.copy, "Copy details") +
    face("done", ICONS.check, "Copied") +
    face("failed", ICONS.copy, "Couldn't copy") +
    `</span>`;
  return button;
}

/** Build the notice for `descriptor`. Listeners are tied to `signal`. */
export function BuildLyricsNotice(
  descriptor: string,
  status: number,
  uri: string | undefined,
  signal: AbortSignal,
  onRetry: () => void
): HTMLElement {
  const copy = NOTICES[descriptor];
  const notice = document.createElement("div");
  notice.className = "LyricsNotice";
  notice.dataset.notice = descriptor;

  const title = document.createElement("p");
  title.className = "notice-title";
  title.textContent = copy.title;

  const body = document.createElement("p");
  body.className = "notice-body";
  body.textContent = copy.body;

  const actions = document.createElement("div");
  actions.className = "notice-actions";

  if (copy.retry) {
    const retry = makeButton(ICONS.retry, "Try again", true);
    retry.addEventListener("click", onRetry, { signal });
    actions.appendChild(retry);
  }

  if (copy.report) {
    const copyButton = makeCopyButton(!copy.retry);
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    copyButton.addEventListener(
      "click",
      async () => {
        const ok = await CopyText(BuildBugReport({ notice: { descriptor, status, uri } }), copyButton);
        copyButton.dataset.state = ok ? "done" : "failed";
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          copyButton.dataset.state = "idle";
        }, 2000);
      },
      { signal }
    );
    signal.addEventListener("abort", () => clearTimeout(resetTimer), { once: true });
    actions.appendChild(copyButton);
  }

  const discord = makeButton(ICONS.chat, "Get help on Discord");
  discord.addEventListener("click", () => window.open(DISCORD_INVITE_URL, "_blank"), { signal });
  actions.appendChild(discord);

  notice.append(title, body, actions);

  if (copy.report) {
    const code = document.createElement("p");
    code.className = "notice-code";
    code.textContent = `Code: ${descriptor}${status ? ` (${status})` : ""}`;
    notice.appendChild(code);
  }

  return notice;
}
