import { useStore } from "@nanostores/react";
import {
  $animationFpsCap,
  $animationFpsCapEnabled,
  $customGoogleFont,
  $customSystemFont,
  $customFontEnabled,
  $customFontSource,
  $skipSpicyFont,
  $useUpstreamSettingsLayout,
} from "../../../../utils/stores.ts";
import { Select, Slider, Toggle } from "./components.tsx";
import { AppearanceIcon } from "./icons.tsx";
import { isGoogleFont } from "../../../../utils/googleFonts.ts";
import { FontPicker } from "./FontPicker.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Settings",
    settings: [
      {
        id: "useClassicSettingsLayout",
        label: "Use Classic Settings Layout",
        description: "Return to the original settings layout. All settings stay exactly as they are.",
        keywords: "old legacy original settings panel",
        Control: ({ label }) => (
          <Toggle label={label} checked={!useStore($useUpstreamSettingsLayout)} onChange={(value) => $useUpstreamSettingsLayout.set(!value)} />
        ),
      },
    ],
  },
  {
    title: "Text",
    settings: [
      {
        id: "customFontEnabled",
        label: "Use Custom Font",
        description: "Use a Google Font or installed font instead of the bundled Spicy Lyrics font.",
        keywords: "font family typeface",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($customFontEnabled)} onChange={(v) => $customFontEnabled.set(v)} />
        ),
      },
      {
        id: "customFontSource",
        label: "Font Source",
        description: "Choose Google Fonts or a locally installed system font.",
        keywords: "google system font family typeface coollabs",
        useDisabled: () => !useStore($customFontEnabled) && "Turn on Use Custom Font to change this.",
        Control: ({ disabled, label }) => (
          <Select label={label} disabled={disabled} value={useStore($customFontSource)} options={["google", "system"]} labels={["Google Fonts", "System Font"]} onChange={(value) => $customFontSource.set(value as "google" | "system")} />
        ),
      },
      {
        id: "googleFont",
        label: "Google Font",
        description: "Browse Google Fonts with live previews. The selected font loads through coolLabs Fonts.",
        keywords: "google font family typeface coollabs",
        useDisabled: () => {
          // Both hooks run on every render; an early return between them crashes the panel when the toggle flips.
          const enabled = useStore($customFontEnabled);
          const source = useStore($customFontSource);
          if (!enabled) return "Turn on Use Custom Font to change this.";
          return source !== "google" && "Choose Google Fonts as the Font Source first.";
        },
        Control: ({ disabled, label }) => {
          const value = useStore($customGoogleFont);
          return <FontPicker label={label} disabled={disabled} source="google" value={isGoogleFont(value) ? value : ""} onChange={(font) => $customGoogleFont.set(font)} />;
        },
      },
      {
        id: "systemFont",
        label: "System Font",
        description: "Browse installed fonts with live previews.",
        keywords: "installed local system font family typeface",
        useDisabled: () => {
          const enabled = useStore($customFontEnabled);
          const source = useStore($customFontSource);
          if (!enabled) return "Turn on Use Custom Font to change this.";
          return source !== "system" && "Choose System Font as the Font Source first.";
        },
        Control: ({ disabled, label }) => <FontPicker label={label} disabled={disabled} source="system" value={useStore($customSystemFont)} onChange={(font) => $customSystemFont.set(font)} />,
      },
      {
        id: "skipSpicyFont",
        label: "Use System Font",
        description: "Use your system font instead of the Spicy Lyrics font.",
        keywords: "default font typeface",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($skipSpicyFont)}
            onChange={(v) => $skipSpicyFont.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Performance",
    settings: [
      {
        id: "animationFpsCapEnabled",
        label: "Limit Frame Rate",
        description:
          "Redraw the lyrics, background and scroll less often to save CPU, especially on high refresh rate displays.",
        keywords: "fps cap animation",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($animationFpsCapEnabled)}
            onChange={(v) => $animationFpsCapEnabled.set(v)}
          />
        ),
      },
      {
        id: "animationFpsCap",
        label: "Frame Rate",
        description: "Frames per second while the limit is on.",
        keywords: "fps cap animation",
        stacked: true,
        useDisabled: () =>
          !useStore($animationFpsCapEnabled) && "Turn on Limit Frame Rate to change this.",
        Control: ({ disabled, label }) => (
          <Slider
            label={label}
            value={useStore($animationFpsCap)}
            min={15}
            max={240}
            step={5}
            defaultValue={60}
            unit="FPS"
            onChange={(v) => $animationFpsCap.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
];

export const appearanceSection: SectionDef = {
  id: "appearance",
  title: "Appearance",
  icon: AppearanceIcon,
  groups: () => groups,
};
