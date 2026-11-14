import {
  AdvancedIcon,
  AppearanceIcon,
  ExperimentsIcon,
  InterfaceIcon,
  LyricsIcon,
  SourcesIcon,
} from "./icons.tsx";

/**
 * The single category vocabulary shared by the classic and upstream settings
 * renderers. A setting's category belongs here, not in either panel's tabs.
 */
export const SETTINGS_CATEGORIES = [
  { id: "appearance", label: "Appearance", classicLabel: "Appearance", icon: AppearanceIcon },
  { id: "lyrics", label: "Lyrics", classicLabel: "Lyrics Display", icon: LyricsIcon },
  { id: "effects", label: "Effects", classicLabel: "Effects", icon: ExperimentsIcon },
  { id: "interface", label: "Interface", classicLabel: "Interface", icon: InterfaceIcon },
  { id: "sources", label: "Sources", classicLabel: "Sources", icon: SourcesIcon },
  { id: "advanced", label: "Advanced", classicLabel: "Advanced", icon: AdvancedIcon },
] as const;

export type SettingsCategoryId = (typeof SETTINGS_CATEGORIES)[number]["id"];

/** The authoritative category for every fork-only row. */
export const FORK_SETTING_CATEGORIES: Record<string, SettingsCategoryId> = {
  "appearance-background-type": "appearance",
  "appearance-background-blur": "appearance",
  "appearance-pinned-footer": "appearance",
  "appearance-npv-background": "appearance",
  "appearance-sliderbar-styling": "appearance",
  "appearance-settings-design": "appearance",
  "appearance-fps-limit": "appearance",
  "appearance-fps-cap": "appearance",
  "appearance-custom-font": "appearance",
  "appearance-cover-art-animation": "effects",
  "lyrics-space-gravity": "effects",
  "lyrics-word-filters": "effects",
  "lyrics-simple-mode": "effects",
  "effects-animator-presets": "effects",
  "effects-renderer-style": "effects",
  "interface-no-lyrics-notice": "interface",
  "interface-lock-media-box": "interface",
  "interface-disable-popup": "interface",
  "interface-view-controls": "interface",
  "interface-always-fullscreen": "interface",
  "interface-fullscreen-volume": "interface",
  "interface-release-year": "interface",
  "interface-music-video-stage": "interface",
  "interface-nowbar-moving-artwork": "interface",
  "interface-motion-artwork": "interface",
  "interface-motion-artwork-priority": "interface",
  "interface-motion-artwork-stage": "interface",
  "interface-animate-close": "interface",
  "interface-escape-key": "interface",
  "interface-disable-npv": "interface",
  "interface-hide-empty-npv": "interface",
  "interface-open-profiles-browser": "interface",
  "interface-remove-spotify-lyrics": "interface",
  "sources-lrcred-model": "sources",
  "advanced-cache-button": "sources",
  "advanced-cache-actions": "sources",
};

export const settingsInCategory = (category: SettingsCategoryId) =>
  Object.entries(FORK_SETTING_CATEGORIES)
    .filter(([, value]) => value === category)
    .map(([id]) => id);
