import { useStore } from "@nanostores/react";
import { useEffect } from "react";
import {
  $playbackOffset,
  $scrollLeadEnabled,
  $scrollLeadMs,
  $seekFadeCompensation,
  $showScrollToActiveButton,
  $rendererVisualStyle,
  $calmBloomScroll,
  $scrollMotionBlur,
  $scrollMotionBlurMode,
  type ScrollMotionBlurMode,
  $smoothScrolling,
  $staticAutoScroll,
  type StaticAutoScroll,
} from "../../../../utils/stores.ts";
import { $experiment, getExperiment } from "../../../../utils/experiments.ts";
import {
  $offsetScope,
  $songOffsets,
  setSongOffset,
  OFFSET_LIMIT_MS,
} from "../../../../utils/songOffsets.ts";
import { $ttmlReviewer } from "../../../../utils/ttmlReviewer.ts";
import { useCurrentUri } from "../../LyricsManager/hooks/useCurrentUri.ts";
import { Segmented, Select, Slider, Toggle } from "./components.tsx";
import { PlaybackIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Timing",
    settings: [
      {
        id: "playbackOffset",
        label: "Playback Offset",
        description:
          "Shift the lyrics in time. Negative shows them earlier, positive later. A song's own offset adds to the one for all songs.",
        keywords: "sync delay latency milliseconds per song track",
        stacked: true,
        useNote: () => {
          const scope = useStore($offsetScope);
          const uri = useCurrentUri();
          const songOffset = useStore($songOffsets)[uri ?? ""] ?? 0;
          const reviewing = useStore($ttmlReviewer);
          const title = uri && Spicetify.Player.data?.item?.name;
          if (!title) return false;
          if (scope === "song") {
            const artist = Spicetify.Player.data?.item?.artists?.[0]?.name;
            return artist ? `For “${title}” by ${artist}.` : `For “${title}”.`;
          }
          if (!songOffset) return false;
          if (reviewing) return `“${title}” has ${songOffset > 0 ? "+" : ""}${songOffset} ms of its own, ignored while TTML Reviewer is on.`;
          return `“${title}” also has ${songOffset > 0 ? "+" : ""}${songOffset} ms of its own.`;
        },
        Aside: ({ disabled }) => {
          const uri = useCurrentUri();
          const scope = useStore($offsetScope);
          // The row always opens on All songs.
          useEffect(() => () => $offsetScope.set("all"), []);
          // A locked row (TTML Reviewer) stays on All songs: the song's own offset is ignored then.
          useEffect(() => {
            if (disabled) $offsetScope.set("all");
          }, [disabled]);
          return (
            <Segmented
              label="Offset applies to"
              disabled={disabled}
              value={scope === "song" && uri && !disabled ? "song" : "all"}
              options={[
                { value: "all", label: "All songs" },
                { value: "song", label: "This song", disabled: !uri },
              ]}
              onChange={(v) => $offsetScope.set(v)}
            />
          );
        },
        Control: ({ label }) => {
          const scope = useStore($offsetScope);
          const uri = useCurrentUri();
          const offsets = useStore($songOffsets);
          const global = useStore($playbackOffset);
          const editingSong = scope === "song" && !!uri;
          return (
            <Slider
              label={editingSong ? `${label}, this song` : label}
              value={editingSong ? (offsets[uri] ?? 0) : global}
              min={-OFFSET_LIMIT_MS}
              max={OFFSET_LIMIT_MS}
              step={10}
              defaultValue={0}
              unit="ms"
              nudges={[10, 100]}
              editable
              onChange={(v) => (editingSong ? setSongOffset(uri, v) : $playbackOffset.set(v))}
            />
          );
        },
      },
      {
        id: "seekFadeCompensation",
        label: "Seek Fade-in Compensation",
        description:
          "Clicking a line starts 300 ms before it, so Spotify's fade-in doesn't clip the first word. Best for rap and fast songs.",
        keywords: "click jump",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($seekFadeCompensation)}
            onChange={(v) => $seekFadeCompensation.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Scrolling",
    settings: [
      {
        id: "smoothScrolling",
        label: "Smooth Scrolling",
        description: "Glide from line to line instead of jumping.",
        // Bloom brings its own scroll, whatever this is set to.
        useDisabled: () =>
          useStore($rendererVisualStyle) === "bloom" && "Bloom scrolls the lyrics its own way.",
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($smoothScrolling)}
            onChange={(v) => $smoothScrolling.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "calmBloomScroll",
        label: "Calm Bloom Scrolling",
        description: "Use a gentler bezier curve with a calmer, unhurried settle when Bloom scrolls between lines.",
        keywords: "bloom smooth scroll bezier calm ease transition",
        useDisabled: () =>
          useStore($rendererVisualStyle) !== "bloom" && "Only applies with the Bloom renderer style.",
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($calmBloomScroll)}
            onChange={(v) => $calmBloomScroll.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "scrollMotionBlur",
        label: "Scroll Motion Blur",
        description: "Blur moving lyrics while scrolling between lines.",
        keywords: "motion blur scroll bloom velocity",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($scrollMotionBlur)}
            onChange={(v) => $scrollMotionBlur.set(v)}
          />
        ),
      },
      {
        id: "scrollMotionBlurMode",
        label: "Motion Blur Style",
        description: "Smooth uses a fast GPU blur; Directional stretches lines vertically like a camera streak (heavier).",
        keywords: "motion blur style smooth directional vertical streak",
        useDisabled: () => !useStore($scrollMotionBlur) && "Turn on Scroll Motion Blur to change this.",
        Control: ({ disabled, label }) => (
          <Select
            label={label}
            value={useStore($scrollMotionBlurMode)}
            options={["smooth", "directional"]}
            labels={["Smooth (Fast)", "Directional"]}
            onChange={(v) => $scrollMotionBlurMode.set(v as ScrollMotionBlurMode)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "showScrollToActiveButton",
        label: "Show Scroll to Active Button",
        description: "Show an arrow that jumps back to the line being sung when you've scrolled away from it.",
        keywords: "jump back current line arrow button scrolled away",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($showScrollToActiveButton)} onChange={(v) => $showScrollToActiveButton.set(v)} />
        ),
      },
      {
        id: "scrollLeadEnabled",
        label: "Early Scroll",
        description: "Start scrolling to the next line just before it's sung.",
        keywords: "lead ahead",
        // Bloom starts each scroll early by its own length in Popup Lyrics and
        // the Now Playing card (ScrollToActiveLine.ts).
        useNote: () =>
          useStore($rendererVisualStyle) === "bloom" &&
          "With Bloom, Popup Lyrics and the Now Playing card always start the scroll early, by as long as the scroll takes.",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($scrollLeadEnabled)}
            onChange={(v) => $scrollLeadEnabled.set(v)}
          />
        ),
      },
      {
        id: "scrollLeadMs",
        label: "Early Scroll Time",
        description: "How far ahead of the line the scroll starts.",
        keywords: "lead ahead",
        stacked: true,
        useDisabled: () => !useStore($scrollLeadEnabled) && "Turn on Early Scroll to change this.",
        Control: ({ disabled, label }) => (
          <Slider
            label={label}
            value={useStore($scrollLeadMs)}
            min={0}
            max={800}
            step={10}
            defaultValue={250}
            unit="ms"
            onChange={(v) => $scrollLeadMs.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "staticAutoScroll",
        label: "Auto-scroll Unsynced Lyrics",
        description:
          "Scroll lyrics without timing through the song. Basic skips quiet parts. Advanced follows the singing, falling back to Basic for songs Spotify has no voice data for. Either can drift on some songs.",
        keywords: "static plain unsynced vocals pace",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($staticAutoScroll)}
            options={["off", "basic", "advanced"]}
            labels={["Off", "Basic", "Advanced"]}
            onChange={(v) => $staticAutoScroll.set(v as StaticAutoScroll)}
          />
        ),
      },
    ],
  },
];

export const playbackSection: SectionDef = {
  id: "playback",
  title: "Playback",
  icon: PlaybackIcon,
  groups: () => groups,
};
