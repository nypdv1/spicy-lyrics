import { useStore } from "@nanostores/react";
import {
  $disableNpvLyrics,
  $alwaysShowInFullscreen,
  $autoQueueWhenNoLyrics,
  $animateFullscreenClose,
  $escapeKeyFunction,
  $openProfilesInBrowser,
  $hideNpvLyricsWhenUnavailable,
  $hideNowBarInCinema,
  $lockedMediaBox,
  $communityLyricsUseDisplayName,
  $coverArtAnimation,
  $canvasOnStage,
  $motionArtwork,
  $motionArtworkOnStage,
  $motionArtworkPriority,
  $nowBarForMovingArtwork,
  $popupLyricsAllowed,
  $popupShowsCover,
  $popupCoverArtwork,
  $popupCoverWhenNoLyrics,
  POPUP_COVER_ARTWORK_OPTIONS,
  POPUP_COVER_ARTWORK_LABELS,
  type PopupCoverArtwork,
  $releaseYearPosition,
  $removeSpotifyLyricsButton,
  $showNoLyricsNotice,
  $showVolumeSlider,
  $showVolumeSliderFullscreen,
  $viewControlsPosition,
  type MotionArtworkPriority,
  type ReleaseYearPosition,
} from "../../../../utils/stores.ts";
import { $experiment, getExperiment } from "../../../../utils/experiments.ts";
import { $isGlobalNav } from "../../../../utils/uiState.ts";
import { Segmented, Select, Toggle } from "./components.tsx";
import { InterfaceIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// The two stage rows only mean something with motion artwork on and the Canvas Stage running.
function useStageRowDisabled(): string | false {
  const motion = useStore($motionArtwork);
  const stage = useStore($experiment("canvasImmersive"));
  if (!motion) return "Turn on Motion Artwork to change this.";
  if (!stage) return `Only applies with ${getExperiment("canvasImmersive").label} on, in Experiments.`;
  return false;
}

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Lyrics View",
    settings: [
      {
        id: "viewControlsPosition",
        label: "View Controls Position",
        description: "Where the view controls (play, scroll and so on) sit.",
        keywords: "lyrics controls top bottom",
        useDisabled: () =>
          !useStore($isGlobalNav) && "Only available with Spotify's new navigation layout.",
        Control: ({ disabled, label }) => (
          <Select
            label={label}
            value={useStore($viewControlsPosition)}
            options={["Top", "Bottom"]}
            onChange={(v) => $viewControlsPosition.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "releaseYearPosition",
        label: "Release Year",
        description: "Show the song's release year in the NowBar, before or after the artists.",
        keywords: "year date album nowbar artists",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($releaseYearPosition)}
            options={["off", "left", "right"]}
            labels={["Off", "Left", "Right"]}
            onChange={(v) => $releaseYearPosition.set(v as ReleaseYearPosition)}
          />
        ),
      },
      {
        id: "lockedMediaBox",
        label: "Lock Media Box in Compact Mode",
        description: "Keep the media box from resizing while Forced Compact Mode is on.",
        keywords: "size artwork",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($lockedMediaBox)}
            onChange={(v) => $lockedMediaBox.set(v)}
          />
        ),
      },
      {
        id: "showNoLyricsNotice",
        label: "No Lyrics Notice",
        description:
          "Explain why a song has no lyrics. Off hides it in the lyrics page, Fullscreen and Popup Lyrics, leaving just the song info. Errors still show their notice.",
        keywords: "unavailable missing message hide popup pip page",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($showNoLyricsNotice)}
            onChange={(v) => $showNoLyricsNotice.set(v)}
          />
        ),
      },
      {
        id: "showVolumeSlider",
        label: "Volume Slider",
        description:
          "Show a volume control on the artwork in Fullscreen, Cinema View and Popup Lyrics.",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($showVolumeSlider)}
            onChange={(v) => $showVolumeSlider.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Fullscreen",
    settings: [
      {
        id: "autoQueueWhenNoLyrics",
        label: "Show Queue When There Are No Lyrics",
        description: "In fullscreen and Cinema View, show the queue in place of a song's missing lyrics. Switching back to Lyrics keeps it closed for that song.",
        keywords: "queue up next no lyrics cinema fullscreen automatic",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($autoQueueWhenNoLyrics)} onChange={(v) => $autoQueueWhenNoLyrics.set(v)} />
        ),
      },
      {
        id: "alwaysShowInFullscreen",
        label: "Always Show in Fullscreen",
        description: "Keep the fullscreen time or controls visible.",
        keywords: "fullscreen controls time",
        Control: ({ label }) => {
          const value = useStore($alwaysShowInFullscreen);
          return <Select label={label} value={value === "All" ? "Both" : value} options={["None", "Controls", "Time", "Both"]} onChange={(v) => $alwaysShowInFullscreen.set(v)} />;
        },
      },
      {
        id: "fullscreenVolumeSlider",
        label: "Fullscreen Volume Slider",
        description: "Show a volume slider in fullscreen and Cinema View.",
        keywords: "volume cinema",
        Control: ({ label }) => <Select label={label} value={useStore($showVolumeSliderFullscreen)} options={["Off", "Left", "Right", "Below"]} onChange={(v) => $showVolumeSliderFullscreen.set(v)} />,
      },
      {
        id: "hideNowBarInCinema",
        label: "Hide NowBar in Cinema View",
        description: "Hide the player while Cinema View is open. Fullscreen is unchanged.",
        keywords: "cinema player nowbar hide",
        Control: ({ label }) => <Toggle label={label} checked={useStore($hideNowBarInCinema)} onChange={(v) => $hideNowBarInCinema.set(v)} />,
      },
      {
        id: "animateFullscreenClose",
        label: "Animate Closing Fullscreen",
        description: "Slide the lyrics page away when closing fullscreen.",
        Control: ({ label }) => <Toggle label={label} checked={useStore($animateFullscreenClose)} onChange={(v) => $animateFullscreenClose.set(v)} />,
      },
      {
        id: "escapeKeyFunction",
        label: "Escape Key Function",
        description: "Choose how Escape behaves in lyrics fullscreen.",
        keywords: "keyboard exit",
        Control: ({ label }) => <Select label={label} value={useStore($escapeKeyFunction)} options={["Default", "Exit Fullscreen", "Exit Fully"]} onChange={(v) => $escapeKeyFunction.set(v)} />,
      },
    ],
  },
  {
    title: "Album Artwork",
    settings: [
      {
        id: "coverArtAnimation",
        label: "Cover Art Animation",
        description: "Animate the cover art in the NowBar when the song changes.",
        keywords: "album artwork cover transition change song nowbar",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($coverArtAnimation)} onChange={(v) => $coverArtAnimation.set(v)} />
        ),
      },
      {
        id: "nowBarForMovingArtwork",
        label: "NowBar for Canvas and Motion Artwork",
        description: "When the NowBar is hidden, bring it in for songs with a Canvas or motion artwork.",
        keywords: "nowbar canvas motion artwork moving cover",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($nowBarForMovingArtwork)} onChange={(v) => $nowBarForMovingArtwork.set(v)} />
        ),
      },
      {
        id: "motionArtwork",
        label: "Motion Artwork",
        description: "Play the album's animated cover over the still one in the NowBar, for albums that have one.",
        keywords: "animated cover art album video moving artwork",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($motionArtwork)} onChange={(v) => $motionArtwork.set(v)} />
        ),
      },
      {
        id: "motionArtworkPriority",
        label: "Motion Artwork or Canvas",
        description:
          "Which one plays when a song has both. Motion Artwork plays on the cover, or on the stage if it's allowed there below.",
        keywords: "animated cover spotify canvas stage video priority prefer both",
        useDisabled: useStageRowDisabled,
        Control: ({ disabled, label }) => (
          <Segmented<MotionArtworkPriority>
            label={label}
            value={useStore($motionArtworkPriority)}
            options={[
              { value: "motion", label: "Motion" },
              { value: "canvas", label: "Canvas" },
            ]}
            onChange={(v) => $motionArtworkPriority.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "motionArtworkOnStage",
        label: "Motion Artwork on Canvas Stage",
        description:
          "Let motion artwork fill the Canvas Stage, cropped to fit since it's square. Off keeps it on the cover in the NowBar.",
        keywords: "animated cover spotify canvas stage video fullscreen side",
        useDisabled: useStageRowDisabled,
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($motionArtworkOnStage)}
            onChange={(v) => $motionArtworkOnStage.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "canvasOnStage",
        label: "Spotify Canvas on Canvas Stage",
        description: "Play songs' Spotify Canvas videos on the Canvas Stage. Off leaves the stage to motion artwork: a song with only a Canvas keeps its cover.",
        keywords: "spotify canvas video stage disable off motion only animated cover",
        useDisabled: () =>
          !useStore($experiment("canvasImmersive")) &&
          `Only applies with ${getExperiment("canvasImmersive").label} on, in Experiments.`,
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($canvasOnStage)}
            onChange={(v) => $canvasOnStage.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
  {
    title: "Now Playing Sidebar",
    settings: [
      {
        id: "npvLyrics",
        label: "Lyrics Card",
        description: "Show lyrics in the Now Playing sidebar.",
        keywords: "disable npv lyrics now playing view",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={!useStore($disableNpvLyrics)}
            onChange={(v) => $disableNpvLyrics.set(!v)}
          />
        ),
      },
      {
        id: "hideNpvLyricsWhenUnavailable",
        label: "Hide When a Song Has No Lyrics",
        description:
          "Remove the card instead of showing a notice. It comes back on the next song with lyrics.",
        keywords: "npv lyrics unavailable",
        useDisabled: () => useStore($disableNpvLyrics) && "Turn on Lyrics Card to change this.",
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($hideNpvLyricsWhenUnavailable)}
            onChange={(v) => $hideNpvLyricsWhenUnavailable.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
  {
    title: "Windows and Buttons",
    settings: [
      {
        id: "communityLyricsUseDisplayName",
        label: "Community Lyrics Display Names",
        description: "Show profile display names instead of usernames in community lyric credits.",
        keywords: "community lyrics credits profile username display name",
        Control: ({ label }) => <Toggle label={label} checked={useStore($communityLyricsUseDisplayName)} onChange={(v) => $communityLyricsUseDisplayName.set(v)} />,
      },
      {
        id: "openProfilesInBrowser",
        label: "Open Profiles in Browser",
        description: "Open contributor profiles in your browser instead of inside Spotify.",
        Control: ({ label }) => <Toggle label={label} checked={useStore($openProfilesInBrowser)} onChange={(v) => $openProfilesInBrowser.set(v)} />,
      },
      {
        id: "popupLyricsAllowed",
        label: "Popup Lyrics",
        description: "Let lyrics open in a floating window.",
        keywords: "disable popup lyrics window pip picture in picture",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($popupLyricsAllowed)}
            onChange={(v) => $popupLyricsAllowed.set(v)}
          />
        ),
      },
      {
        id: "popupShowsCover",
        label: "Album Cover Instead of Lyrics in Popup",
        description: "In the popup window, show the album cover where the lyrics would be, with the player docked below it. Needs the Popup Player Dock experiment.",
        keywords: "popup mini player pip album cover art artwork hide lyrics",
        useDisabled: () =>
          !useStore($experiment("popupDock")) &&
          `Only applies with ${getExperiment("popupDock").label} on, in Experiments.`,
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($popupShowsCover)}
            onChange={(v) => $popupShowsCover.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "popupCoverWhenNoLyrics",
        label: "Album Cover When a Song Has No Lyrics",
        description: "With lyrics on in the popup, a song with no lyrics shows the full-window album cover instead of the notice. The next song with lyrics brings them back.",
        keywords: "popup mini player cover no lyrics missing notice automatic",
        useDisabled: () =>
          !useStore($experiment("popupDock")) &&
          `Only applies with ${getExperiment("popupDock").label} on, in Experiments.`,
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($popupCoverWhenNoLyrics)}
            onChange={(v) => $popupCoverWhenNoLyrics.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "popupCoverArtwork",
        label: "Popup Cover Animation",
        description: "What plays on the popup's full-window album cover: the album's motion artwork, the song's Canvas (cropped to fill), one with the other as a fallback, or just the still cover.",
        keywords: "popup mini player cover motion artwork animated canvas video priority",
        useDisabled: () =>
          !useStore($experiment("popupDock")) &&
          `Only applies with ${getExperiment("popupDock").label} on, in Experiments.`,
        Control: ({ disabled, label }) => (
          <Select
            label={label}
            value={useStore($popupCoverArtwork)}
            options={[...POPUP_COVER_ARTWORK_OPTIONS]}
            labels={POPUP_COVER_ARTWORK_OPTIONS.map((o) => POPUP_COVER_ARTWORK_LABELS[o])}
            onChange={(v) => $popupCoverArtwork.set(v as PopupCoverArtwork)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "removeSpotifyLyricsButton",
        label: "Hide Spotify's Lyrics Button",
        description:
          "Remove Spotify's own lyrics button from the playback bar. The Spicy Lyrics button stays.",
        keywords: "remove playbar",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($removeSpotifyLyricsButton)}
            onChange={(v) => $removeSpotifyLyricsButton.set(v)}
          />
        ),
      },
    ],
  },
];

export const interfaceSection: SectionDef = {
  id: "interface",
  title: "Interface",
  icon: InterfaceIcon,
  groups: () => groups,
};
