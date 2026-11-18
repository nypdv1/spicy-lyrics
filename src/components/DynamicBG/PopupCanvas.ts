import Logger from "../../utils/Logger.ts";
import { $popupCoverArtwork, $popupShowsCover } from "../../utils/stores.ts";
import Global from "../Global/Global.ts";
import { PageContainer } from "../Pages/PageView.ts";
import { GetArtworkPlacement } from "./CanvasImmersive.ts";
import { AttachCanvasMedia, GetPlayingCanvasInfo, LoadCanvasMedia } from "./CanvasVideo.ts";

/*
 * The song's Canvas on the popup's full-window cover (Album Cover Instead of Lyrics). Whether it
 * plays there, or the motion artwork does (AnimatedArtwork.ts), is GetArtworkPlacement's call,
 * from the popup's own choice ($popupCoverArtwork). The video shares the motion artwork's look
 * (AnimatedArtwork.css): over the still cover, cropped to fill it, fading in once it plays.
 */

const popupCanvasLogger = new Logger("Popup Canvas");

let video: HTMLVideoElement | null = null;
let playingFileId: string | null = null;
let detach: (() => void) | null = null;
let generation = 0;
// A Canvas that wouldn't play here; the cover (or motion artwork) stands in for it.
let failedFileId: string | null = null;

export const FailedPopupCanvas = (): string | null => failedFileId;

function getContainer(): HTMLElement | null {
  return PageContainer?.querySelector<HTMLElement>(".ContentBox .NowBar .Header .MediaBox .MediaImageContainer") ?? null;
}

function stop(): void {
  generation++;
  detach?.();
  detach = null;
  video?.remove();
  video = null;
  playingFileId = null;
}

async function Refresh(): Promise<void> {
  const placement = GetArtworkPlacement();
  const info = placement.popupCanvas ? GetPlayingCanvasInfo() : null;
  const container = getContainer();
  if (!info || !container) {
    stop();
    return;
  }
  if (playingFileId === info.fileId && video && container.contains(video)) {
    void video.play().catch(() => undefined);
    return;
  }

  stop();
  const gen = generation;
  const doc = container.ownerDocument;
  const element = doc.createElement("video");
  element.className = "AnimatedArtwork PopupCanvas";
  element.muted = true;
  element.loop = true;
  element.playsInline = true;
  element.autoplay = true;
  element.disablePictureInPicture = true;
  element.setAttribute("aria-hidden", "true");
  container.append(element);
  video = element;
  playingFileId = info.fileId;

  try {
    const media = await LoadCanvasMedia(info);
    if (gen !== generation) return;
    if (!media) throw new Error("no playable canvas");
    const release = await AttachCanvasMedia(element, media);
    if (gen !== generation) {
      release();
      return;
    }
    detach = release;
    element.addEventListener("playing", () => element.classList.add("Visible"), { once: true });
    await element.play().catch(() => undefined);
  } catch (error) {
    if (gen !== generation) return;
    popupCanvasLogger.warn("Canvas failed in the popup", error);
    failedFileId = info.fileId;
    stop();
    // The motion artwork or the cover takes its place.
    Global.Event.evoke("canvas-stage:change", null);
  }
}

const refresh = () => void Refresh();
Global.Event.listen("page:open", refresh);
Global.Event.listen("page:destroy", stop);
Global.Event.listen("playback:songchange", refresh);
Global.Event.listen("canvas-stage:change", refresh);
Global.Event.listen("motion-artwork:verdict", refresh);
// Both change where the artwork goes, for the cover's video too.
for (const store of [$popupCoverArtwork, $popupShowsCover]) {
  store.listen(() => queueMicrotask(() => Global.Event.evoke("canvas-stage:change", null)));
}
