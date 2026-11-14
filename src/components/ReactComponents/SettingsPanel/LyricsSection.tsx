import { useStore } from "@nanostores/react";
import React, { useEffect } from "react";
import {
  $lineHoverBackground,
  $longWordThreshold,
  $syllableMerge,
  $syllablePace,
  $lyricsSize,
  $romanizationDisplay,
  $staticAutoScroll,
  type RomanizationDisplay,
  type StaticAutoScroll,
  type SyllableMerge,
  $duetLinePadding,
  $creditsFollowLastLine,
  $allowHidingSettings,
  $hiddenSettingIds,
  $minimalLyricsMode,
  $playbackOffset,
  $seekFadeCompensation,
  $scrollLeadEnabled,
  $scrollLeadMs,
  $smoothScrolling,
  $rightAlignLyrics,
  $showScrollToActiveButton,
} from "../../../utils/stores.ts";
import { matches, Row, Select, SectionTitle, Slider, Toggle } from "./components.tsx";
import { $offsetScope, $songOffsets, OFFSET_LIMIT_MS, setSongOffset } from "../../../utils/songOffsets.ts";
import { $ttmlReviewer, REVIEWER_LOCK_REASON } from "../../../utils/ttmlReviewer.ts";
import { useCurrentUri } from "../LyricsManager/hooks/useCurrentUri.ts";
import { ExperimentSettings } from "./ExperimentsPanel.tsx";

const SECTION_NAME = "Lyrics Display";
const simpleLyricsOptions = ["Off", "calculate", "animate"];
const simpleLyricsLabels = ["Off", "Calculate", "Animate"];
const uniqueWordFilterOptions = ["Off", "Gibberish", "all lowercase", "ALL UPPERCASE"];
interface Props { query: string; sectionFilter: string; showHidden?: boolean; }

export default function LyricsSection({ query, sectionFilter, showHidden = false }: Props) {
  const minimalLyricsMode = useStore($minimalLyricsMode);
  const rightAlignLyrics = useStore($rightAlignLyrics);
  const showScrollToActiveButton = useStore($showScrollToActiveButton);
  const playbackOffset = useStore($playbackOffset);
  const seekFadeCompensation = useStore($seekFadeCompensation);
  const scrollLeadEnabled = useStore($scrollLeadEnabled);
  const scrollLeadMs = useStore($scrollLeadMs);
  const smoothScrolling = useStore($smoothScrolling);
  const lineHoverBackground = useStore($lineHoverBackground);
  const longWordThreshold = useStore($longWordThreshold);
  const syllableMerge = useStore($syllableMerge);
  const syllablePace = useStore($syllablePace);
  const lyricsSize = useStore($lyricsSize);
  const romanizationDisplay = useStore($romanizationDisplay);
  const staticAutoScroll = useStore($staticAutoScroll);
  const offsetScope = useStore($offsetScope);
  const songOffsets = useStore($songOffsets);
  const reviewing = useStore($ttmlReviewer);
  const currentUri = useCurrentUri();
  // The offset row always opens on All songs.
  useEffect(() => () => $offsetScope.set("all"), []);
  const duetLinePadding = useStore($duetLinePadding);
  const creditsFollowLastLine = useStore($creditsFollowLastLine);
  const allowHidingSettings = useStore($allowHidingSettings);
  const hiddenSettingIds = useStore($hiddenSettingIds);
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const visible = (id: string) => showHidden ? hiddenSettingIds.includes(id) : !allowHidingSettings || !hiddenSettingIds.includes(id) || Boolean(query.trim());
  const r3 = visible("lyrics-minimal-mode") && matches(query, "Minimal Lyrics Mode", "Hides sung lyrics lines in Fullscreen and Cinema Mode");
  const r4 = visible("lyrics-right-align") && matches(query, "Right Align Lyrics", "Flip duet/opposite lyric alignment.");
  const r5 = visible("lyrics-scroll-active") && matches(query, "Show Scroll to Active Button", "Show an arrow button when the active lyric is outside the viewport.");
  const r8 = visible("lyrics-playback-offset") && matches(query, "Playback Offset", "Shift lyrics timing earlier or later, in milliseconds.");
  const r9 = visible("lyrics-line-hover") && matches(query, "Line Hover Background", "Shows a highlight box behind a lyrics line when you hover over it");
  const r10 = visible("lyrics-wide-duet-padding") && matches(query, "Wide duet line padding", "Separate duet voices into wider columns. Disable for compact padding.");
  const seek = visible("lyrics-seek-compensation") && matches(query, "Seek Fade-in Compensation", "Click lyrics 300ms early to compensate for Spotify's fade-in.");
  const early = visible("lyrics-early-scroll") && matches(query, "Early Scroll", "Start scrolling before the next lyric becomes active.");
  const lead = visible("lyrics-early-scroll-time") && matches(query, "Early Scroll Time", "How early the next line is scrolled to, in milliseconds.");
  const smooth = visible("lyrics-smooth-scrolling") && matches(query, "Smooth Scrolling", "Use spring motion for scrolling and interlude transitions.");
  const skeleton = visible("lyrics-loading-skeleton") && matches(query, "Lyrics Loading Skeleton", "Show placeholder lines while lyrics load; disable to restore the spinner.");
  const credits = visible("lyrics-credits-follow-singer") && matches(query, "Credits Follow the Last Singer", "Align credits with the last duet line.");
  const joinSplit = visible("lyrics-syllable-merge") && matches(query, "Join Split Words", "Show a word sung in syllables as one word.");
  const pace = visible("lyrics-syllable-pace") && matches(query, "Keep Syllable Pace", "A joined word lit letter by letter follows each syllable's timing.");
  const size = visible("lyrics-size") && matches(query, "Lyrics Size", "Make the lyrics bigger or smaller in every view.");
  const romanization = visible("lyrics-romanization-display") && matches(query, "Romanization", "Show romanization in place of the lyrics, or under each line.");
  const staticScroll = visible("lyrics-static-autoscroll") && matches(query, "Auto-scroll Unsynced Lyrics", "Scroll lyrics without timing through the song.");
  const longWord = visible("lyrics-long-word-threshold") && matches(query, "Long Word Minimum", "Minimum duration for a word to use long held-word effects.");
  if (![r3, r4, r5, r8, r9, r10, seek, early, lead, smooth, skeleton, credits, joinSplit, pace, size, romanization, staticScroll, longWord].some(Boolean)) return null;

  // The Playback Offset row edits the offset for every song, or the playing song's own,
  // which adds to it. TTML Reviewer ignores a song's own offset, so the row stays on All songs.
  const editingSong = offsetScope === "song" && Boolean(currentUri) && !reviewing;
  const songOffset = currentUri ? songOffsets[currentUri] ?? 0 : 0;
  const songTitle = currentUri ? Spicetify.Player.data?.item?.name : undefined;
  const offsetNote = editingSong
    ? `For "${songTitle ?? "this song"}". Adds to the offset for all songs.`
    : songOffset && songTitle
      ? `"${songTitle}" also has ${songOffset > 0 ? "+" : ""}${songOffset} ms of its own${reviewing ? ", ignored while TTML Reviewer is on" : ""}.`
      : "Shift lyrics timing earlier or later, in milliseconds.";

  return <>
    <SectionTitle>Lyrics Display</SectionTitle>
    {r3 && <Row settingId="lyrics-minimal-mode" label="Minimal Lyrics Mode" description="Hides sung lyrics lines in Fullscreen and Cinema Mode"><Toggle checked={minimalLyricsMode} onChange={(v) => $minimalLyricsMode.set(v)} /></Row>}
    {r4 && <Row settingId="lyrics-right-align" label="Right Align Lyrics" description="Flip duet/opposite lyric alignment."><Toggle checked={rightAlignLyrics} onChange={(v) => $rightAlignLyrics.set(v)} /></Row>}
    {r5 && <Row settingId="lyrics-scroll-active" label="Show Scroll to Active Button" description="Show an arrow when the active lyric is outside the viewport."><Toggle checked={showScrollToActiveButton} onChange={(v) => $showScrollToActiveButton.set(v)} /></Row>}
    {size && <Row settingId="lyrics-size" label="Lyrics Size" description="Make the lyrics bigger or smaller in every view, including romanization and background vocals. 100% is each view's usual size." stacked><Slider value={lyricsSize} min={60} max={200} step={5} defaultValue={100} unit="%" onChange={(v) => $lyricsSize.set(v)} /></Row>}
    {r8 && <Row settingId="lyrics-playback-offset" label={editingSong ? "Playback Offset, this song" : "Playback Offset"} description={offsetNote} labelAccessory={<Select value={editingSong ? "song" : "all"} options={currentUri && !reviewing ? ["all", "song"] : ["all"]} labels={currentUri && !reviewing ? ["All songs", "This song"] : ["All songs"]} onChange={(v) => $offsetScope.set(v as "all" | "song")} />} disabled={reviewing} disabledReason={REVIEWER_LOCK_REASON} stacked><Slider value={editingSong && currentUri ? songOffset : playbackOffset} min={-OFFSET_LIMIT_MS} max={OFFSET_LIMIT_MS} step={10} defaultValue={0} unit="ms" disabled={reviewing} onChange={(v) => (editingSong && currentUri ? setSongOffset(currentUri, v) : $playbackOffset.set(v))} /></Row>}
    {seek && <Row settingId="lyrics-seek-compensation" label="Seek Fade-in Compensation" description="Clicking a lyric seeks 300ms before it, so Spotify's fade-in does not cut off the start."><Toggle checked={seekFadeCompensation} onChange={(v) => $seekFadeCompensation.set(v)} /></Row>}
    {(early || lead || smooth) && <SectionTitle>Scrolling</SectionTitle>}
    {early && <Row settingId="lyrics-early-scroll" label="Early Scroll" description="Start scrolling to the next line before it becomes active."><Toggle checked={scrollLeadEnabled} onChange={(v) => $scrollLeadEnabled.set(v)} /></Row>}
    {lead && <Row settingId="lyrics-early-scroll-time" label="Early Scroll Time" description="How early to move to the next line." disabled={!scrollLeadEnabled} disabledReason="Enable Early Scroll to modify this setting" stacked><Slider value={scrollLeadMs} min={0} max={800} step={10} defaultValue={250} unit="ms" onChange={(v) => $scrollLeadMs.set(Math.max(0, Math.min(800, Math.round(v / 10) * 10)))} disabled={!scrollLeadEnabled} /></Row>}
    {staticScroll && <Row settingId="lyrics-static-autoscroll" label="Auto-scroll Unsynced Lyrics" description="Scroll lyrics without timing through the song. Basic skips quiet parts. Advanced follows the singing, falling back to Basic for songs Spotify has no voice data for. Either can drift on some songs."><Select value={staticAutoScroll} options={["off", "basic", "advanced"]} labels={["Off", "Basic", "Advanced"]} onChange={(v) => $staticAutoScroll.set(v as StaticAutoScroll)} /></Row>}
    {smooth && <Row settingId="lyrics-smooth-scrolling" label="Smooth Scrolling" description="Use spring motion for scrolling and interlude transitions."><Toggle checked={smoothScrolling} onChange={(v) => $smoothScrolling.set(v)} /></Row>}
    {skeleton && <ExperimentSettings experimentIds={["lyricsSkeleton"]} showBuiltIn={false} />}
    {r9 && <Row settingId="lyrics-line-hover" label="Line Hover Background" description="Shows a highlight box behind a lyrics line when you hover over it"><Toggle checked={lineHoverBackground} onChange={(v) => $lineHoverBackground.set(v)} /></Row>}
    {r10 && <Row settingId="lyrics-wide-duet-padding" label="Wide duet line padding" description="Separate duet voices into wider columns. Disable for compact padding."><Toggle checked={duetLinePadding} onChange={(v) => $duetLinePadding.set(v)} /></Row>}
    {romanization && <Row settingId="lyrics-romanization-display" label="Romanization" description="With romanization on, show it in place of the original lyrics, or as a smaller row under each line."><Select value={romanizationDisplay} options={["replace", "underLine"]} labels={["Replace the line", "Under each line"]} onChange={(v) => $romanizationDisplay.set(v as RomanizationDisplay)} /></Row>}
    {joinSplit && <Row settingId="lyrics-syllable-merge" label="Join Split Words" description="Show a word sung in syllables as one word. Steadily Sung keeps only words with no gap and an even pace between parts; Held Words only those long enough to light up letter by letter."><Select value={syllableMerge} options={["off", "full", "steady", "held"]} labels={["Off", "All Words", "Steadily Sung", "Held Words"]} onChange={(v) => $syllableMerge.set(v as SyllableMerge)} /></Row>}
    {longWord && <Row settingId="lyrics-long-word-threshold" label="Long Word Minimum" description="A held word must last at least this long before its per-letter lift and glow run." stacked><Slider value={longWordThreshold} min={250} max={4000} step={50} defaultValue={1500} unit="ms" onChange={(v) => $longWordThreshold.set(v)} /></Row>}
    {pace && <Row settingId="lyrics-syllable-pace" label="Keep Syllable Pace" description="A joined word that lights up letter by letter follows each syllable's timing, slow on a long syllable and quick on a short one." disabled={syllableMerge === "off"} disabledReason="Pick a Join Split Words mode to change this."><Toggle checked={syllablePace} onChange={(v) => $syllablePace.set(v)} /></Row>}
    {credits && <Row settingId="lyrics-credits-follow-singer" label="Credits Follow the Last Singer" description="Align credits with the last duet line."><Toggle checked={creditsFollowLastLine} onChange={(v) => $creditsFollowLastLine.set(v)} /></Row>}
  </>;
}
