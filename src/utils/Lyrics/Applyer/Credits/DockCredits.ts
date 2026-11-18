import { isExperimentEnabled } from "../../../experiments.ts";
import { CreateTextScroller, type TextScroller } from "../../../TextScroller.ts";

/*
 * Pinned credits in the docked popup. The pinned footer (CreateLyricsFooter.ts) holds the source,
 * the community credits and, in Full mode, the songwriters at the bottom of the lyrics. The popup
 * is too small to give that band up, so with the Popup Player Dock the credits go into the dock
 * instead: one line in its time row, between the elapsed and total times (.TimelineCredits,
 * PopupDock.css). A line that doesn't fit scrolls back and forth like the song name.
 *
 * The pinned layer stays where it is, so everything that looks it up still finds it; whatever
 * lands in it is moved on into the line. Rows are moved, not copied, so their links, tooltips and
 * profile clicks come along. The line is emptied whenever the lyrics clear their footer
 * (ClearDockCredits), so a new song never shows the last one's credits.
 */

let page: HTMLElement | null = null;
let layerObserver: MutationObserver | null = null;
let nowBarObserver: MutationObserver | null = null;
let sizeObserver: ResizeObserver | null = null;
let line: HTMLElement | null = null;
let scroller: TextScroller | null = null;

function active(): boolean {
  return (
    !!page?.closest(".spicy-pip-wrapper") &&
    isExperimentEnabled("popupDock") &&
    page.matches(":is(.PinnedFooterMode_NoWriters, .PinnedFooterMode_Full):not(.SpaceGravityMode, .CardMode)")
  );
}

/** The credits line, made on first use and kept in the dock's current timeline. */
function ensureLine(): HTMLElement | null {
  const timeline = page?.querySelector<HTMLElement>(".NowBar .Timeline");
  if (!page || !timeline) return null;
  if (!line) {
    const doc = page.ownerDocument;
    const view = doc.defaultView ?? window;
    line = doc.createElement("div");
    line.className = "TimelineCredits";
    const track = doc.createElement("div");
    track.className = "SongCredits";
    line.append(track);
    sizeObserver = new view.ResizeObserver(fit);
    sizeObserver.observe(line);
    sizeObserver.observe(track);
    // Under reduced motion the line holds at its start and its end fades out.
    scroller = CreateTextScroller([line], { holdOnReducedMotion: true });
  }
  if (line.parentElement !== timeline) timeline.append(line);
  return line;
}

/**
 * Centred with the avatars when it fits. When it doesn't, the avatars go (data-marquee) and the
 * scroller moves the text. Nothing in the line shrinks, so the track's offsetWidth is its natural
 * width, which doesn't change as the scroll moves it.
 */
function fit(): void {
  const track = line?.firstElementChild as HTMLElement | null | undefined;
  if (!line || !track) return;
  delete line.dataset.marquee;
  const style = (line.ownerDocument.defaultView ?? window).getComputedStyle(line);
  const room = line.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (track.offsetWidth > room) line.dataset.marquee = "";
}

/** Moves whatever the pinned layer holds into the line. Full mode's footer comes in flattened. */
function collect(layer: HTMLElement): void {
  if (!active() || layer.childElementCount === 0) return;
  const target = ensureLine()?.firstElementChild as HTMLElement | null | undefined;
  if (!target) return;
  for (const child of [...layer.children]) {
    if (child.classList.contains("LyricsFooter")) {
      target.append(...child.children);
      child.remove();
    } else {
      target.append(child);
    }
  }
  line!.hidden = target.childElementCount === 0;
}

/** Empties the line, for lyrics that are about to replace their credits. */
export function ClearDockCredits(): void {
  const track = line?.firstElementChild;
  track?.replaceChildren();
  if (line) {
    line.hidden = true;
    delete line.dataset.marquee;
  }
}

/** Starts moving the pinned credits of this page into its dock. Call again for a new page. */
export function WatchDockCredits(next: HTMLElement): void {
  layerObserver?.disconnect();
  nowBarObserver?.disconnect();
  sizeObserver?.disconnect();
  scroller?.destroy();
  line?.remove();
  line = null;
  scroller = null;
  sizeObserver = null;

  page = next;
  const doc = next.ownerDocument;
  const view = doc.defaultView ?? window;
  const layer = next.querySelector<HTMLElement>(".LyricsContainer > .LyricsPinnedFooter");
  if (!layer) return;
  layerObserver = new view.MutationObserver(() => collect(layer));
  layerObserver.observe(layer, { childList: true });
  // The player, timeline included, is rebuilt now and then; the line follows into the new one.
  const nowBar = next.querySelector(".NowBar");
  if (nowBar) {
    nowBarObserver = new view.MutationObserver(() => {
      if (line && !line.isConnected && active()) ensureLine();
    });
    nowBarObserver.observe(nowBar, { childList: true, subtree: true });
  }
  collect(layer);
}
