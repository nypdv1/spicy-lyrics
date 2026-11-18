import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";

/*
 * Spotify's playback shortcuts in the popup. The popup is its own window, so keys pressed while it
 * has focus never reach Spotify's. The same keys as the desktop app:
 *
 *   Space                play / pause
 *   Ctrl+Right / Left    next / previous track
 *   Shift+Right / Left   seek forward / back 5 s
 *   Ctrl+Up / Down       volume up / down
 *   Ctrl+S, Ctrl+R       shuffle, repeat
 *   Alt+Shift+B          like / unlike
 *
 * Cmd stands in for Ctrl on macOS. Keys pressed in a text field are left alone, and Space or Enter
 * on a focused button presses the button.
 */

const SEEK_MS = 5000;
const VOLUME_STEP = 0.1;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

function isButton(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === "function" && !!el.closest("button, a[href], [role='button']");
}

function seekBy(deltaMs: number): void {
  const player = Spicetify?.Player;
  if (!player) return;
  const duration = player.getDuration?.() ?? 0;
  const position = player.getProgress?.() ?? 0;
  player.seek(Math.max(0, Math.min(duration > 0 ? duration - 500 : Infinity, position + deltaMs)));
}

function changeVolume(delta: number): void {
  const player = Spicetify?.Player;
  if (!player?.setVolume) return;
  const volume = player.getVolume?.() ?? 0;
  player.setVolume(Math.max(0, Math.min(1, Math.round((volume + delta) * 100) / 100)));
}

function handle(event: KeyboardEvent): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  const player = Spicetify?.Player;
  if (!player) return false;

  if (event.code === "Space" && !ctrl && !event.altKey && !event.shiftKey) {
    if (isButton(event.target)) return false;
    player.togglePlay();
    return true;
  }
  if (ctrl && !event.altKey && !event.shiftKey) {
    switch (event.key) {
      case "ArrowRight": player.next(); return true;
      case "ArrowLeft": player.back(); return true;
      case "ArrowUp": changeVolume(VOLUME_STEP); return true;
      case "ArrowDown": changeVolume(-VOLUME_STEP); return true;
    }
    switch (event.key.toLowerCase()) {
      case "s": player.toggleShuffle(); return true;
      case "r": player.toggleRepeat(); return true;
    }
    return false;
  }
  if (event.shiftKey && !ctrl && !event.altKey) {
    if (event.key === "ArrowRight") { seekBy(SEEK_MS); return true; }
    if (event.key === "ArrowLeft") { seekBy(-SEEK_MS); return true; }
    return false;
  }
  if (event.altKey && event.shiftKey && !ctrl && event.code === "KeyB") {
    void SpotifyPlayer.ToggleLike();
    return true;
  }
  return false;
}

/** Listens for the shortcuts in the popup window; they go with the window when it closes. */
export function AttachPopupShortcuts(popup: Window): void {
  popup.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat && event.code === "Space") return;
    if (isTyping(event.target)) return;
    if (handle(event)) event.preventDefault();
  });
}
