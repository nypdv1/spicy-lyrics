import { useStore } from "@nanostores/react";
import { useContext } from "react";
import {
  $centerLyrics,
  $creditsFollowLastLine,
  $duetLinePadding,
  $lineHoverBackground,
  $longWordThreshold,
  $lyricsSize,
  $minimalLyricsMode,
  $pinnedFooterMode,
  $rendererVisualStyle,
  $romanizationDisplay,
  $syllableMerge,
  $syllablePace,
  $restartVocalStutters,
  $rightAlignLyrics,
  $spaceGravityMode,
  $memeFormat,
  $simpleLyricsMode,
  $simpleLyricsModeRenderingType,
  RENDERER_VISUAL_STYLES,
  RENDERER_VISUAL_STYLE_LABELS,
  type RendererVisualStyle,
  type RomanizationDisplay,
  type SyllableMerge,
} from "../../../../utils/stores.ts";
import { $animatorPreset, type AnimatorPreset } from "../../../../utils/Lyrics/Animator/Tuning.ts";
import { Select, SettingsNavContext, Slider, Toggle } from "./components.tsx";
import { LyricsIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Text",
    settings: [
      {
        id: "lyricsSize",
        label: "Lyrics Size",
        description:
          "Makes the lyrics bigger or smaller in every view, including romanization and background vocals. 100% is each view's usual size.",
        keywords: "font text scale bigger smaller zoom",
        stacked: true,
        Control: ({ label }) => (
          <Slider
            label={label}
            value={useStore($lyricsSize)}
            min={60}
            max={200}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={(v) => $lyricsSize.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Style",
    settings: [
      {
        id: "spaceGravityMode",
        label: "Space Gravity Mode",
        description: "Let word-synced lyrics drift and tumble while their timing animation continues.",
        keywords: "gravity floating moving words",
        Control: ({ label }) => <Toggle label={label} checked={useStore($spaceGravityMode)} onChange={(v) => $spaceGravityMode.set(v)} />,
      },
      {
        id: "memeFormat",
        label: "Unique Word Filters",
        description: "Transform every lyric word.",
        keywords: "gibberish uppercase lowercase meme",
        Control: ({ label }) => <Select label={label} value={useStore($memeFormat)} options={["Off", "Gibberish", "all lowercase", "ALL UPPERCASE"]} onChange={(v) => $memeFormat.set(v)} />,
      },
      {
        id: "simpleLyricsMode",
        label: "Simple Lyrics Mode",
        description: "Choose how simple lyric transitions render.",
        keywords: "calculate animate transitions",
        useDisabled: () => useStore($rendererVisualStyle) !== "spring" && "Only applies with the Spring renderer style.",
        Control: ({ disabled, label }) => {
          const enabled = useStore($simpleLyricsMode);
          const renderingType = useStore($simpleLyricsModeRenderingType);
          const value = enabled ? renderingType : "Off";
          return <Select label={label} disabled={disabled} value={value} options={["Off", "calculate", "animate"]} labels={["Off", "Calculate", "Animate"]} onChange={(v) => { $simpleLyricsMode.set(v !== "Off"); if (v !== "Off") $simpleLyricsModeRenderingType.set(v); }} />;
        },
      },
      {
        id: "rendererVisualStyle",
        label: "Renderer Visual Style",
        description:
          "Visual design of rendered lyrics. \"Spring\" is the default Spicy Lyrics renderer you know.",
        keywords: "simple lyrics mode refreshed renderer animation effects plain spring bloom",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($rendererVisualStyle)}
            options={[...RENDERER_VISUAL_STYLES]}
            labels={RENDERER_VISUAL_STYLES.map((style) => RENDERER_VISUAL_STYLE_LABELS[style])}
            onChange={(v) => $rendererVisualStyle.set(v as RendererVisualStyle)}
          />
        ),
      },
      {
        id: "animatorPreset",
        label: "Animator Presets",
        description: "How the Spring renderer moves words. Default matches upstream, Pixel keeps the Spicy Lyrics feel, and Custom uses your own tuning.",
        keywords: "animator animation spring tuning pixel custom preset behavior",
        useDisabled: () => useStore($rendererVisualStyle) !== "spring" && "Only applies with the Spring renderer style.",
        Control: ({ disabled, label }) => {
          const preset = useStore($animatorPreset);
          const { manageAnimator } = useContext(SettingsNavContext);
          return (
            <span className="sl-us-control-pair">
              {preset === "Custom" && manageAnimator && (
                <button type="button" className="sl-us-btn" disabled={disabled} onClick={manageAnimator}>Manage</button>
              )}
              <Select label={label} disabled={disabled} value={preset} options={["Default", "Pixel", "Custom"]} onChange={(v) => $animatorPreset.set(v as AnimatorPreset)} />
            </span>
          );
        },
      },
      {
        id: "minimalLyricsMode",
        label: "Fade Away Previous Lines",
        description: "Hide lines that have already been sung in Fullscreen and Cinema View.",
        keywords: "minimal lyrics mode hide sung",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($minimalLyricsMode)}
            onChange={(v) => $minimalLyricsMode.set(v)}
          />
        ),
      },
      {
        id: "syllableMerge",
        label: "Join Split Words",
        description:
          "Show a word sung in syllables as one word. Steadily Sung keeps only words with no gap and an even pace between parts; Held Words only those long enough to light up letter by letter.",
        keywords: "syllables merge held steady",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($syllableMerge)}
            options={["off", "full", "steady", "held"]}
            labels={["Off", "All Words", "Steadily Sung", "Held Words"]}
            onChange={(v) => $syllableMerge.set(v as SyllableMerge)}
          />
        ),
      },
      {
        id: "longWordThreshold",
        label: "Long Word Minimum",
        description: "A held word must last at least this long before its per-letter lift and glow run.",
        keywords: "held word duration timer threshold letter effect",
        stacked: true,
        Control: ({ label }) => (
          <Slider
            label={label}
            value={useStore($longWordThreshold)}
            min={250}
            max={4000}
            step={50}
            defaultValue={1500}
            unit="ms"
            onChange={(v) => $longWordThreshold.set(v)}
          />
        ),
      },
      {
        id: "restartVocalStutters",
        label: "Restart Vocal Stutters",
        description: "Treat repeated dashed starts such as te-te-test as one visual word while each fragment restarts its timing animation.",
        keywords: "stutter vocal repeated dash word sync restart",
        Control: ({ label }) => <Toggle label={label} checked={useStore($restartVocalStutters)} onChange={(v) => $restartVocalStutters.set(v)} />,
      },
      {
        id: "syllablePace",
        label: "Keep Syllable Pace",
        description:
          "A joined word that lights up letter by letter follows each syllable's timing, slow on a long syllable and quick on a short one.",
        keywords: "syllables merge held letters timing",
        useDisabled: () => useStore($syllableMerge) === "off" && "Pick a Join Split Words mode to change this.",
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($syllablePace)}
            onChange={(v) => $syllablePace.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
  {
    title: "Lines",
    settings: [
      {
        id: "centerLyrics",
        label: "Center Lyrics",
        description: "Center every line instead of aligning it to the left. Duet lines are centered too.",
        keywords: "align alignment middle centre centered left",
        Control: ({ label }) => <Toggle label={label} checked={useStore($centerLyrics)} onChange={(v) => $centerLyrics.set(v)} />,
      },
      {
        id: "rightAlignLyrics",
        label: "Right Align Lyrics",
        description: "Swap which side each singer's lines sit on, so the main voice is on the right.",
        keywords: "align alignment duet opposite flip side",
        useDisabled: () => useStore($centerLyrics) && "Turn off Center Lyrics to change this.",
        Control: ({ disabled, label }) => <Toggle label={label} disabled={disabled} checked={useStore($rightAlignLyrics)} onChange={(v) => $rightAlignLyrics.set(v)} />,
      },
      {
        id: "romanizationDisplay",
        label: "Romanization",
        description:
          "With romanization on, show it in place of the original lyrics, or as a smaller row under each line.",
        keywords: "romaji romanized romanize pronunciation under below replace",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($romanizationDisplay)}
            options={["replace", "underLine"]}
            labels={["Replace the line", "Under each line"]}
            onChange={(v) => $romanizationDisplay.set(v as RomanizationDisplay)}
          />
        ),
      },
      {
        id: "lineHoverBackground",
        label: "Highlight on Hover",
        description: "Show a soft box behind a line when you point at it.",
        keywords: "line hover background",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($lineHoverBackground)}
            onChange={(v) => $lineHoverBackground.set(v)}
          />
        ),
      },
      {
        id: "duetLinePadding",
        label: "Duet Line Padding",
        description: "Indent each singer's lines toward their side, so duets read as two columns.",
        keywords: "indent voices",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($duetLinePadding)}
            onChange={(v) => $duetLinePadding.set(v)}
          />
        ),
      },
      {
        id: "creditsFollowLastLine",
        label: "Credits Follow the Last Singer",
        description:
          "When a song ends on a duet line on the right, show the songwriter and provider lines on the right too.",
        keywords: "duet credits written by songwriters provided by provider align side",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($creditsFollowLastLine)}
            onChange={(v) => $creditsFollowLastLine.set(v)}
          />
        ),
      },
      {
        id: "pinnedFooterMode",
        label: "Pinned Credits",
        description:
          "Keep the credits at the bottom of the lyrics while they scroll. No Writers pins the lyrics source and community line, Full pins the songwriters too.",
        keywords: "credits footer pin sticky written by songwriters provided by source community bottom",
        Control: ({ label }) => {
          const mode = useStore($pinnedFooterMode);
          return (
          <Select
            label={label}
            value={mode === "No Writers" ? "noWriters" : mode === "Full" ? "full" : "off"}
            options={["off", "noWriters", "full"]}
            labels={["Off", "No Writers", "Full"]}
            onChange={(v) => $pinnedFooterMode.set(v === "noWriters" ? "No Writers" : v === "full" ? "Full" : "Off")}
          />
          );
        },
      },
    ],
  },
];

export const lyricsSection: SectionDef = {
  id: "lyrics",
  title: "Lyrics",
  icon: LyricsIcon,
  groups: () => groups,
};
