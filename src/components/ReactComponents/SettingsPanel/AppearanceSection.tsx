import { $experiment } from "../../../utils/experiments.ts";
import { useStore } from "@nanostores/react";
import React from "react";
import {
  $allowHidingSettings,
  $animationFpsCap,
  $animationFpsCapEnabled,
  $customGoogleFont,
  $customSystemFont,
  $customFontEnabled,
  $customFontSource,
  $showNpvDynamicBg,
  $beatSyncBackground,
  $staticBackgroundBlur,
  $staticBackgroundMode,
  $hiddenSettingIds,
  $pinnedFooterMode,
  $useUpstreamSettingsLayout,
} from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, Select, Slider, Toggle } from "./components.tsx";
import { ExperimentSettings } from "./ExperimentsPanel.tsx";
import { isGoogleFont } from "../../../utils/googleFonts.ts";
import { FontPreviewPicker } from "./FontPreviewPicker.tsx";

const SECTION_NAME = "Appearance";
const FPS_CAP_DESCRIPTION = "Limit how often lyrics, animated backgrounds, and smooth scrolling redraw. Turn off to redraw on every display refresh.";
const FPS_SLIDER_DESCRIPTION = "Frames per second while the cap is on.";
const bgModeOptions = ["default", "legacy", "auto", "artistHeader", "coverArt", "color", "none"];
const bgModeLabels = ["Default", "Legacy", "Auto", "Artist Header", "Cover Art", "Color", "None (Transparent)"];

/** The Background Type's name as Settings shows it. */
export const backgroundModeLabel = (mode: string): string => bgModeLabels[bgModeOptions.indexOf(mode)] ?? mode;

/** Why the Canvas Stage can't show with this Background Type, or false when it can. */
export function canvasStageBackgroundNote(mode: string): string | false {
  const supported = mode === "default" || mode === "off" || mode === "none";
  return !supported && `Not showing: Background Type is ${backgroundModeLabel(mode)}. Canvas Stage works with the Default or None (Transparent) background (Appearance).`;
}

interface Props {
  query: string;
  sectionFilter: string;
  showHidden?: boolean;
}

export default function AppearanceSection({ query, sectionFilter, showHidden = false }: Props) {
  const customFontEnabled = useStore($customFontEnabled);
  const customGoogleFont = useStore($customGoogleFont);
  const customSystemFont = useStore($customSystemFont);
  const customFontSource = useStore($customFontSource);
  const staticBackgroundMode = useStore($staticBackgroundMode);
  const canvasStageEnabled = useStore($experiment("canvasImmersive"));
  const staticBackgroundBlur = useStore($staticBackgroundBlur);
  const beatSyncBackground = useStore($beatSyncBackground);
  const showNpvDynamicBg = useStore($showNpvDynamicBg);
  const pinnedFooterMode = useStore($pinnedFooterMode);
  const allowHidingSettings = useStore($allowHidingSettings);
  const hiddenSettingIds = useStore($hiddenSettingIds);
  const fpsCapEnabled = useStore($animationFpsCapEnabled);
  const fpsCap = useStore($animationFpsCap);
  const useUpstreamSettingsLayout = useStore($useUpstreamSettingsLayout);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const visible = (id: string) => showHidden ? hiddenSettingIds.includes(id) : !allowHidingSettings || !hiddenSettingIds.includes(id) || Boolean(query.trim());
  const r1 = visible("appearance-custom-font") && matches(query, "Use Custom Font", "Use a custom font instead of the bundled Spicy Lyrics font.");
  // Keep the font controls mounted while custom fonts are off. Mounting them on
  // the toggle's click made the settings below jump in like a menu had opened;
  // a disabled control communicates the dependency without changing the layout.
  const r2 = visible("appearance-custom-font") && matches(query, "Font Source", "Choose Google Fonts or an installed system font family for lyrics.");
  const r2a = visible("appearance-custom-font") && customFontSource === "google" && matches(query, "Google Font", "Choose a font from Google Fonts.");
  const r2b = visible("appearance-custom-font") && customFontSource === "system" && matches(query, "System Font", "Choose an installed font family for lyrics.");
  const r3 = visible("appearance-background-type") && matches(query, "Background Type", "Choose the dynamic, legacy, static image, or color background.");
  const r4 = visible("appearance-npv-background") && matches(query, "Display Dynamic Background in Now Playing View", "Show the animated background in the Now Playing panel.");
  const blurApplies = ["auto", "artistHeader", "coverArt"].includes(staticBackgroundMode);
  const r6 = visible("appearance-background-blur") && blurApplies && matches(query, "Background Blur", "Soften the static background image.");
  const rBeat = visible("appearance-beat-sync-background") && matches(query, "Beat-Synced Background", "Pulse the Dynamic (Kawarp) background on each beat.");
  const r7 = visible("appearance-pinned-footer") && matches(query, "Pinned Lyrics Footer", "Keep source and community credits visible. Full also pins writers.");
  const r8 = visible("appearance-sliderbar-styling") && matches(query, "New SliderBar Styling", "New glass-like style for the SliderBar. Disable to revert back to the original one.");
  const r9 = visible("appearance-fps-limit") && matches(query, "Limit Animation Frame Rate", FPS_CAP_DESCRIPTION);
  const r10 = visible("appearance-fps-cap") && fpsCapEnabled && matches(query, "Animation Frame Rate", FPS_SLIDER_DESCRIPTION);
  const newDesign = visible("appearance-settings-design") && matches(query, "New Settings and Update Design", "Use the lavender design for settings, update dialogs, and notifications. Disable for classic neutral styling.");
  const upstreamLayout = visible("appearance-upstream-layout") && matches(query, "Use New Settings Layout", "Switch to the updated upstream settings layout. Your current settings remain unchanged and you can switch back at any time.");

  if (!r1 && !r2 && !r2a && !r2b && !r3 && !r4 && !r6 && !r7 && !r8 && !r9 && !r10 && !newDesign && !upstreamLayout) return null;

  return (
    <>
      <SectionTitle>Appearance</SectionTitle>

      {r3 && (
        <Row settingId="appearance-background-type" label="Background Type" description="Choose the dynamic, legacy, static image, or color background." note={canvasStageEnabled && canvasStageBackgroundNote(staticBackgroundMode) && "Canvas Stage doesn't play with this background: songs with a Canvas show the cover instead. Pick Default or None (Transparent) to see it."}>
          <Select
            value={staticBackgroundMode === "off" ? "default" : staticBackgroundMode}
            options={bgModeOptions}
            labels={bgModeLabels}
            onChange={(v) => $staticBackgroundMode.set(v)}
          />
        </Row>
      )}

      {r6 && (
        <Row settingId="appearance-background-blur" label="Background Blur" description="Soften the static background image." stacked>
          <Slider
            value={staticBackgroundBlur}
            min={0}
            max={48}
            step={1}
            defaultValue={0}
            unit="px"
            onChange={(v) => $staticBackgroundBlur.set(v)}
          />
        </Row>
      )}

      {r7 && (
        <Row settingId="appearance-pinned-footer" label="Pinned Lyrics Footer" description="Keep source and community credits visible. Full also pins writers.">
          <Select value={pinnedFooterMode} options={["Off", "No Writers", "Full"]} onChange={(value) => $pinnedFooterMode.set(value as typeof pinnedFooterMode)} />
        </Row>
      )}
      {rBeat && (
        <Row settingId="appearance-beat-sync-background" label="Beat-Synced Background" description="Pulse the Dynamic (Kawarp) background on each beat using Spotify's beat map.">
          <Toggle checked={beatSyncBackground} onChange={(v) => $beatSyncBackground.set(v)} />
        </Row>
      )}
      {r4 && (
        <Row settingId="appearance-npv-background"
          label="Display Dynamic Background in Now Playing View"
          description="Show the animated background in the Now Playing panel."
        >
          <Toggle checked={showNpvDynamicBg} onChange={(v) => $showNpvDynamicBg.set(v)} />
        </Row>
      )}
      {r8 && <ExperimentSettings experimentIds={["newProgressBarStyling"]} showBuiltIn={false} />}
      {newDesign && <ExperimentSettings experimentIds={["newSettingsDesign"]} showBuiltIn={false} />}
      {upstreamLayout && (
        <Row settingId="appearance-upstream-layout" label="Use New Settings Layout" description="Switch to the updated upstream settings layout. Your current settings remain unchanged and you can switch back at any time.">
          <Toggle checked={useUpstreamSettingsLayout} onChange={(value) => $useUpstreamSettingsLayout.set(value)} />
        </Row>
      )}

      {r9 && (
        <Row settingId="appearance-fps-limit" label="Limit Animation Frame Rate" description={FPS_CAP_DESCRIPTION}>
          <Toggle checked={fpsCapEnabled} onChange={(value) => $animationFpsCapEnabled.set(value)} />
        </Row>
      )}

      {r10 && (
        <Row settingId="appearance-fps-cap" label="Animation Frame Rate" description={FPS_SLIDER_DESCRIPTION} stacked>
          <Slider value={fpsCap} min={15} max={240} step={5} defaultValue={60} unit="FPS"
            onChange={(value) => $animationFpsCap.set(value)} />
        </Row>
      )}

      {r1 && (
        <Row settingId="appearance-custom-font" label="Use Custom Font" description="Use a Google Font or installed font instead of the bundled Spicy Lyrics font.">
          <Toggle checked={customFontEnabled} onChange={(v) => $customFontEnabled.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row label="Font Source" description="Choose Google Fonts or a locally installed system font.">
          <Select disabled={!customFontEnabled} value={customFontSource} options={["google", "system"]} labels={["Google Fonts", "System Font"]} onChange={(value) => $customFontSource.set(value as typeof customFontSource)} />
        </Row>
      )}

      {r2a && (
        <Row label="Google Font" description="Browse Google Fonts with live previews. The selected font loads through coolLabs Fonts.">
          <FontPreviewPicker disabled={!customFontEnabled} source="google" value={isGoogleFont(customGoogleFont) ? customGoogleFont : ""} onChange={(value) => $customGoogleFont.set(value)} />
        </Row>
      )}

      {r2b && (
        <Row label="System Font" description="Browse installed fonts with live previews.">
          <FontPreviewPicker disabled={!customFontEnabled} source="system" value={customSystemFont} onChange={(value) => $customSystemFont.set(value)} />
        </Row>
      )}

    </>
  );
}
