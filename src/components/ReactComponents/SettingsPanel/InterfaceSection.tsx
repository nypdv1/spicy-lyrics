import { useStore } from "@nanostores/react";
import {
  $alwaysShowInFullscreen,
  $autoQueueWhenNoLyrics,
  $allowHidingSettings,
  $animateFullscreenClose,
  $disableNpvLyrics,
  $escapeKeyFunction,
  $hideNpvLyricsWhenUnavailable,
  $hideNowBarInCinema,
  $hiddenSettingIds,
  $lockedMediaBox,
  $openProfilesInBrowser,
  $popupLyricsAllowed,
  $releaseYearPosition,
  $showVolumeSliderFullscreen,
  $removeSpotifyLyricsButton,
  $viewControlsPosition,
  $showNoLyricsNotice,
  $communityLyricsUseDisplayName,
} from "../../../utils/stores.ts";
import { $experiment, getExperiment } from "../../../utils/experiments.ts";
import { $isGlobalNav } from "../../../utils/uiState.ts";
import { matches, Row, Select, SectionTitle, Toggle } from "./components.tsx";
import { $canvasOnStage, $popupCoverWhenNoLyrics, $popupShowsCover, $popupCoverArtwork, POPUP_COVER_ARTWORK_OPTIONS, POPUP_COVER_ARTWORK_LABELS, type PopupCoverArtwork, $motionArtwork, $motionArtworkOnStage, $motionArtworkPriority, $nowBarForMovingArtwork, $staticBackgroundMode, type MotionArtworkPriority } from "../../../utils/stores.ts";
import { backgroundModeLabel, canvasStageBackgroundNote } from "./AppearanceSection.tsx";

const SECTION_NAME = "Interface";
const vcPositionOptions = ["Top", "Bottom"];
const fullscreenOptions = ["None", "Controls", "Time", "Both"];
const volumeOptions = ["Off", "Left", "Right", "Below"];
const releaseYearOptions = ["Off", "Left", "Right"];
const escapeOptions = ["Default", "Exit Fullscreen", "Exit Fully"];

interface Props { query: string; sectionFilter: string; showHidden?: boolean; }

export default function InterfaceSection({ query, sectionFilter, showHidden = false }: Props) {
  const lockedMediaBox = useStore($lockedMediaBox);
  const allowHidingSettings = useStore($allowHidingSettings);
  const popupLyricsAllowed = useStore($popupLyricsAllowed);
  const openProfilesInBrowser = useStore($openProfilesInBrowser);
  const viewControlsPosition = useStore($viewControlsPosition);
  const alwaysShowInFullscreen = useStore($alwaysShowInFullscreen);
  const autoQueueWhenNoLyrics = useStore($autoQueueWhenNoLyrics);
  const showVolumeSliderFullscreen = useStore($showVolumeSliderFullscreen);
  const releaseYearPosition = useStore($releaseYearPosition);
  const escapeKeyFunction = useStore($escapeKeyFunction);
  const animateFullscreenClose = useStore($animateFullscreenClose);
  const hideNpvLyricsWhenUnavailable = useStore($hideNpvLyricsWhenUnavailable);
  const disableNpvLyrics = useStore($disableNpvLyrics);
  const removeSpotifyLyricsButton = useStore($removeSpotifyLyricsButton);
  const showNoLyricsNotice = useStore($showNoLyricsNotice);
  const hideNowBarInCinema = useStore($hideNowBarInCinema);
  const communityLyricsUseDisplayName = useStore($communityLyricsUseDisplayName);
  const isGlobalNav = useStore($isGlobalNav);
  const hiddenSettingIds = useStore($hiddenSettingIds);
  const motionArtwork = useStore($motionArtwork);
  const motionArtworkPriority = useStore($motionArtworkPriority);
  const motionArtworkOnStage = useStore($motionArtworkOnStage);
  const canvasOnStage = useStore($canvasOnStage);
  const popupShowsCover = useStore($popupShowsCover);
  const popupCoverArtwork = useStore($popupCoverArtwork);
  const popupCoverWhenNoLyrics = useStore($popupCoverWhenNoLyrics);
  const popupDock = useStore($experiment("popupDock"));
  const canvasStage = useStore($experiment("canvasImmersive"));
  const nowBarForMovingArtwork = useStore($nowBarForMovingArtwork);
  const backgroundMode = useStore($staticBackgroundMode);
  const stageBackgroundNote = canvasStageBackgroundNote(backgroundMode);
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const ids = ["interface-lock-media-box", "interface-disable-popup", "interface-view-controls", "interface-always-fullscreen", "interface-fullscreen-volume", "interface-release-year", "interface-animate-close", "interface-escape-key", "interface-disable-npv", "interface-hide-empty-npv", "interface-open-profiles-browser", "interface-remove-spotify-lyrics"];
  const rows = [
    matches(query, "Lock Media Box Size in Compact Mode", "Prevent the media box from resizing when Forced Compact Mode is active."), matches(query, "Disable Popup Lyrics Window", "Show or hide the Popup Lyrics button in the playback bar."), matches(query, "Lyrics Controls Position", "Where the lyrics view controls (play, scroll, etc.) appear."), matches(query, "Always Show In Fullscreen", "Keep fullscreen time or controls visible."), matches(query, "Fullscreen Volume Slider", "Show a volume slider in fullscreen."), matches(query, "Release Year Position", "Show release year near track metadata."), matches(query, "Animate closing fullscreen", "Slide the lyrics page away when closing fullscreen."), matches(query, "Escape Key Function", "Choose how Escape behaves in lyrics fullscreen."), matches(query, "Disable NPV Lyrics", "Never show the lyrics card in the Now Playing sidebar."), matches(query, "Hide NPV Lyrics When No Lyrics Are Available", "Remove the lyrics card from the Now Playing sidebar while the current song has no lyrics, instead of showing a notice. It comes back on the next song that has them."), matches(query, "Open Profiles in Browser", "Open contributor profiles in your browser instead of inside Spotify."),
    matches(query, "Remove Spotify's Lyrics Button", "Hide Spotify's built-in lyrics button from the playback bar."),
  ].map((matched, index) => matched && (showHidden ? hiddenSettingIds.includes(ids[index]) : !allowHidingSettings || !hiddenSettingIds.includes(ids[index]) || Boolean(query.trim())));
  const autoQueue = matches(query, "Show Queue When There Are No Lyrics", "In fullscreen and Cinema View, show the queue in place of a song's missing lyrics. Switching back to Lyrics keeps it closed for that song.") && (showHidden ? hiddenSettingIds.includes("interface-auto-queue") : !allowHidingSettings || !hiddenSettingIds.includes("interface-auto-queue") || Boolean(query.trim()));
  const notice = matches(query, "No Lyrics Notice", "Explain why a song has no lyrics. Errors always show their notice.") && (showHidden ? hiddenSettingIds.includes("interface-no-lyrics-notice") : !allowHidingSettings || !hiddenSettingIds.includes("interface-no-lyrics-notice") || Boolean(query.trim()));
  const shown = (id: string, label: string, description: string) =>
    matches(query, label, description) &&
    (showHidden ? hiddenSettingIds.includes(id) : !allowHidingSettings || !hiddenSettingIds.includes(id) || Boolean(query.trim()));
  const movingNowBar = shown("interface-nowbar-moving-artwork", "NowBar for Canvas and Motion Artwork", "With the NowBar off, show it for songs with a Canvas or motion artwork.");
  const motion = shown("interface-motion-artwork", "Motion Artwork", "Play the album's animated cover over the still one.");
  const motionPriority = shown("interface-motion-artwork-priority", "Motion Artwork or Canvas", "Which one plays when a song has both.");
  const motionStage = shown("interface-motion-artwork-stage", "Motion Artwork on Canvas Stage", "Let motion artwork fill the Canvas Stage.");
  const popupCover = shown("interface-popup-cover", "Album Cover Instead of Lyrics in Popup", "Show the album cover in the popup window instead of lyrics.");
  const popupCoverNoLyricsRow = shown("interface-popup-cover-no-lyrics", "Album Cover When a Song Has No Lyrics", "In the popup, show the album cover for songs with no lyrics.");
  const popupCoverArtworkRow = shown("interface-popup-cover-artwork", "Popup Cover Animation", "Motion artwork or Canvas on the popup's album cover.");
  const canvasStageRow = shown("interface-canvas-stage", "Spotify Canvas on Canvas Stage", "Play songs' Spotify Canvas videos on the Canvas Stage.");
  // Unlike the motion rows, this one doesn't need Motion Artwork on.
  const canvasRowDisabledReason = !canvasStage
    ? `Only applies with ${getExperiment("canvasImmersive").label} on, in Experiments.`
    : stageBackgroundNote
      ? `Only applies with the Default background; Background Type is ${backgroundModeLabel(backgroundMode)}.`
      : undefined;
  const cinemaNowBar = shown("interface-hide-nowbar-cinema", "Hide NowBar in Cinema View", "Hide the player while Cinema View is open.");
  const communityNames = shown("lyrics-community-display-names", "Community Lyrics Display Names", "Show profile display names instead of usernames in community lyric credits.");
  // The two stage rows only matter with Motion Artwork on and Canvas Stage enabled.
  const stageRowsDisabledReason = !motionArtwork
    ? "Turn on Motion Artwork to change this."
    : !canvasStage
      ? `Only applies with ${getExperiment("canvasImmersive").label} on, in Experiments.`
      : stageBackgroundNote
        ? `Only applies with the Default background; Background Type is ${backgroundModeLabel(backgroundMode)}.`
        : undefined;
  if (!rows.some(Boolean) && !notice && !motion && !motionPriority && !motionStage && !canvasStageRow && !popupCover && !popupCoverArtworkRow && !popupCoverNoLyricsRow && !movingNowBar && !cinemaNowBar && !communityNames) return null;
  const normalizedAlwaysShow = alwaysShowInFullscreen === "All" ? "Both" : alwaysShowInFullscreen;

  return <>
    <SectionTitle>Interface</SectionTitle>
    {notice && <Row settingId="interface-no-lyrics-notice" label="No Lyrics Notice" description="Explain why a song has no lyrics. Errors always show their notice."><Toggle checked={showNoLyricsNotice} onChange={(v) => $showNoLyricsNotice.set(v)} /></Row>}
    {rows[0] && <Row settingId="interface-lock-media-box" label="Lock Media Box Size in Compact Mode" description="Prevent the media box from resizing when Forced Compact Mode is active."><Toggle checked={lockedMediaBox} onChange={(v) => $lockedMediaBox.set(v)} /></Row>}
    {rows[1] && <Row settingId="interface-disable-popup" label="Disable Popup Lyrics Window" description="Show or hide the Popup Lyrics button in the playback bar."><Toggle checked={!popupLyricsAllowed} onChange={(v) => $popupLyricsAllowed.set(!v)} /></Row>}
    {popupCover && <Row settingId="interface-popup-cover" label="Album Cover Instead of Lyrics in Popup" description="In the popup window, show the album cover where the lyrics would be, with the player docked below it. Needs the Popup Player Dock experiment." disabled={!popupDock} disabledReason={`Only applies with ${getExperiment("popupDock").label} on, in Experiments.`}><Toggle checked={popupShowsCover} onChange={(v) => $popupShowsCover.set(v)} /></Row>}
    {popupCoverNoLyricsRow && <Row settingId="interface-popup-cover-no-lyrics" label="Album Cover When a Song Has No Lyrics" description="With lyrics on in the popup, a song with no lyrics shows the full-window album cover instead of the notice. The next song with lyrics brings them back." disabled={!popupDock} disabledReason={`Only applies with ${getExperiment("popupDock").label} on, in Experiments.`}><Toggle checked={popupCoverWhenNoLyrics} onChange={(v) => $popupCoverWhenNoLyrics.set(v)} /></Row>}
    {popupCoverArtworkRow && <Row settingId="interface-popup-cover-artwork" label="Popup Cover Animation" description="What plays on the popup's full-window album cover: the album's motion artwork, the song's Canvas (cropped to fill), one with the other as a fallback, or just the still cover." disabled={!popupDock} disabledReason={`Only applies with ${getExperiment("popupDock").label} on, in Experiments.`}><Select value={popupCoverArtwork} options={[...POPUP_COVER_ARTWORK_OPTIONS]} labels={POPUP_COVER_ARTWORK_OPTIONS.map((o) => POPUP_COVER_ARTWORK_LABELS[o])} disabled={!popupDock} onChange={(v) => $popupCoverArtwork.set(v as PopupCoverArtwork)} /></Row>}
    {rows[2] && <Row settingId="interface-view-controls" label="View Controls Position" description="Where the view controls (play, scroll, etc.) appear." disabled={!isGlobalNav} disabledReason="Only available in Spotify's new navigation layout"><Select value={viewControlsPosition} options={vcPositionOptions} onChange={(v) => $viewControlsPosition.set(v)} /></Row>}
    {rows[3] && <Row settingId="interface-always-fullscreen" label="Always Show In Fullscreen" description="Keep fullscreen time or controls visible."><Select value={normalizedAlwaysShow} options={fullscreenOptions} onChange={(v) => $alwaysShowInFullscreen.set(v)} /></Row>}
    {autoQueue && <Row settingId="interface-auto-queue" label="Show Queue When There Are No Lyrics" description="In fullscreen and Cinema View, show the queue in place of a song's missing lyrics. Switching back to Lyrics keeps it closed for that song."><Toggle checked={autoQueueWhenNoLyrics} onChange={(v) => $autoQueueWhenNoLyrics.set(v)} /></Row>}
    {rows[4] && <Row settingId="interface-fullscreen-volume" label="Fullscreen Volume Slider" description="Show a volume slider in fullscreen and Cinema View."><Select value={showVolumeSliderFullscreen} options={volumeOptions} onChange={(v) => $showVolumeSliderFullscreen.set(v)} /></Row>}
    {cinemaNowBar && <Row settingId="interface-hide-nowbar-cinema" label="Hide NowBar in Cinema View" description="Hide the player while Cinema View is open. Fullscreen and the normal lyrics view are unchanged."><Toggle checked={hideNowBarInCinema} onChange={(v) => $hideNowBarInCinema.set(v)} /></Row>}
    {rows[5] && <Row settingId="interface-release-year" label="Release Year Position" description="Show release year near track metadata."><Select value={releaseYearPosition} options={releaseYearOptions} onChange={(v) => $releaseYearPosition.set(v)} /></Row>}
    {movingNowBar && <Row settingId="interface-nowbar-moving-artwork" label="NowBar for Canvas and Motion Artwork" description="With the NowBar turned off, bring it in for songs that have a Canvas or motion artwork, and let it go again for songs that don't. The NowBar button hides it for the current song." note={nowBarForMovingArtwork && (!canvasStage || stageBackgroundNote) && `Songs with only a Canvas won't bring it in: Canvas plays with ${getExperiment("canvasImmersive").label} on and the Default background. Motion artwork still does.`}><Toggle checked={nowBarForMovingArtwork} onChange={(v) => $nowBarForMovingArtwork.set(v)} /></Row>}
    {motion && <Row settingId="interface-motion-artwork" label="Motion Artwork" description="Play the album's animated cover over the still one in the NowBar, for albums that have one."><Toggle checked={motionArtwork} onChange={(v) => $motionArtwork.set(v)} /></Row>}
    {motionPriority && <Row settingId="interface-motion-artwork-priority" label="Motion Artwork or Canvas" description="Which one plays when a song has both. Motion Artwork plays on the cover, or on the stage if it's allowed there below." disabled={Boolean(stageRowsDisabledReason)} disabledReason={stageRowsDisabledReason} note={stageRowsDisabledReason}><Select value={motionArtworkPriority} options={["motion", "canvas"]} labels={["Motion", "Canvas"]} disabled={Boolean(stageRowsDisabledReason)} onChange={(v) => $motionArtworkPriority.set(v as MotionArtworkPriority)} /></Row>}
    {motionStage && <Row settingId="interface-motion-artwork-stage" label="Motion Artwork on Canvas Stage" description="Let motion artwork fill the Canvas Stage, cropped to fit since it's square. Off keeps it on the cover in the NowBar." disabled={Boolean(stageRowsDisabledReason)} disabledReason={stageRowsDisabledReason} note={stageRowsDisabledReason}><Toggle checked={motionArtworkOnStage} onChange={(v) => $motionArtworkOnStage.set(v)} /></Row>}
    {canvasStageRow && <Row settingId="interface-canvas-stage" label="Spotify Canvas on Canvas Stage" description="Play songs' Spotify Canvas videos on the Canvas Stage. Off leaves the stage to motion artwork: a song with only a Canvas keeps its cover." disabled={Boolean(canvasRowDisabledReason)} disabledReason={canvasRowDisabledReason} note={canvasRowDisabledReason}><Toggle checked={canvasOnStage} onChange={(v) => $canvasOnStage.set(v)} /></Row>}
    {rows[6] && <Row settingId="interface-animate-close" label="Animate closing fullscreen" description="Slide the lyrics page away when closing fullscreen."><Toggle checked={animateFullscreenClose} onChange={(v) => $animateFullscreenClose.set(v)} /></Row>}
    {rows[7] && <Row settingId="interface-escape-key" label="Escape Key Function" description="Choose how Escape behaves in lyrics fullscreen."><Select value={escapeKeyFunction} options={escapeOptions} onChange={(v) => $escapeKeyFunction.set(v)} /></Row>}
    {rows[8] && <Row settingId="interface-disable-npv" label="Disable NPV Lyrics" description="Never show the lyrics card in the Now Playing sidebar."><Toggle checked={disableNpvLyrics} onChange={(v) => $disableNpvLyrics.set(v)} /></Row>}
    {rows[9] && <Row settingId="interface-hide-empty-npv" label="Hide NPV Lyrics When No Lyrics Are Available" description="Remove the lyrics card when the current song has no lyrics." disabled={disableNpvLyrics} disabledReason="The NPV lyrics card is disabled"><Toggle checked={hideNpvLyricsWhenUnavailable} onChange={(v) => $hideNpvLyricsWhenUnavailable.set(v)} /></Row>}
    {rows[10] && <Row settingId="interface-open-profiles-browser" label="Open Profiles in Browser" description="Open contributor profiles in your browser instead of inside Spotify."><Toggle checked={openProfilesInBrowser} onChange={(v) => $openProfilesInBrowser.set(v)} /></Row>}
    {communityNames && <Row settingId="lyrics-community-display-names" label="Community Lyrics Display Names" description="Show profile display names instead of usernames in community lyric credits."><Toggle checked={communityLyricsUseDisplayName} onChange={(v) => $communityLyricsUseDisplayName.set(v)} /></Row>}
    {rows[11] && <Row settingId="interface-remove-spotify-lyrics" label="Remove Spotify's Lyrics Button" description="Hide Spotify's built-in lyrics button. The Spicy Lyrics buttons stay visible."><Toggle checked={removeSpotifyLyricsButton} onChange={(v) => $removeSpotifyLyricsButton.set(v)} /></Row>}
  </>;
}
