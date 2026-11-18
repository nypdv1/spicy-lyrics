import { useStore } from "@nanostores/react";
import {
  LYRICS_CACHE_ACTIONS,
  normalizeLyricsCacheAction,
  RemoveCurrentLyrics_AllCaches,
  RemoveCurrentLyrics_StateCache,
  RemoveLyricsCache,
} from "../../../../utils/LyricsCacheTools.ts";
import { OpenBuildChannelManager } from "../../../../utils/openBuildChannelPanel.tsx";
import {
  $developerMode,
  $lyricsCacheAction,
  $rememberSettingsMenuLocation,
  $showLyricsCacheActionButton,
} from "../../../../utils/stores.ts";
import { useBuildChannelChoice } from "../../BuildChannelPanel.tsx";
import { Select, Toggle } from "./components.tsx";
import { AdvancedIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Lyrics Cache",
    settings: [
      {
        id: "clearCurrentSongCaches",
        label: "Clear This Song's Cache",
        description: "Remove everything cached for the song that's playing now.",
        keywords: "clear all caches current song",
        Control: () => (
          <button
            type="button"
            className="sl-us-btn"
            onClick={() => RemoveCurrentLyrics_AllCaches(true)}
          >
            Clear
          </button>
        ),
      },
      {
        id: "clearStoredLyricsCache",
        label: "Clear Stored Lyrics",
        description: "Delete all saved lyrics. They are normally kept for up to 3 days.",
        keywords: "clear lyrics cache",
        Control: () => (
          <button type="button" className="sl-us-btn" onClick={() => RemoveLyricsCache(true)}>
            Clear
          </button>
        ),
      },
      {
        id: "clearCurrentSongState",
        label: "Reset This Song's Lyrics",
        description: "Drop the playing song's lyrics from memory only, so they load again.",
        keywords: "clear current song internal state cache",
        Control: () => (
          <button
            type="button"
            className="sl-us-btn"
            onClick={() => RemoveCurrentLyrics_StateCache(true)}
          >
            Reset
          </button>
        ),
      },
      {
        id: "showLyricsCacheActionButton",
        label: "Cache Button in Lyrics View",
        description: "Add a button to the lyrics view controls that runs the cache action below.",
        keywords: "clear cache button view controls shortcut",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($showLyricsCacheActionButton)} onChange={(v) => $showLyricsCacheActionButton.set(v)} />
        ),
      },
      {
        id: "lyricsCacheAction",
        label: "Cache Button Action",
        description: "What the lyrics view's cache button clears.",
        keywords: "clear cache button action current state stored",
        useDisabled: () => !useStore($showLyricsCacheActionButton) && "Turn on Cache Button in Lyrics View to change this.",
        Control: ({ disabled, label }) => (
          <Select
            label={label}
            disabled={disabled}
            value={normalizeLyricsCacheAction(useStore($lyricsCacheAction))}
            options={LYRICS_CACHE_ACTIONS.map((action) => action.value)}
            labels={LYRICS_CACHE_ACTIONS.map((action) => action.label)}
            onChange={(v) => $lyricsCacheAction.set(normalizeLyricsCacheAction(v))}
          />
        ),
      },
    ],
  },
  {
    title: "Settings Menu",
    settings: [
      {
        id: "rememberSettingsMenuLocation",
        label: "Remember Menu Location After Close",
        description: "Reopen Settings on the tab you last used, even after Spotify restarts.",
        keywords: "remember last tab reopen settings location",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($rememberSettingsMenuLocation)} onChange={(v) => $rememberSettingsMenuLocation.set(v)} />
        ),
      },
    ],
  },
  {
    title: "Developer",
    settings: [
      {
        id: "buildChannel",
        label: "Build Channel",
        description: "Which build of Spicy Lyrics to load. Switching reloads Spotify.",
        keywords: "branch stable beta channel build version reload",
        Control: ({ label }) => {
          const { channels, selected, select } = useBuildChannelChoice();
          return (
            <span className="sl-us-control-pair">
              <button type="button" className="sl-us-btn" onClick={OpenBuildChannelManager}>Manage</button>
              <Select label={label} value={selected} options={channels} onChange={select} />
            </span>
          );
        },
      },
      {
        id: "developerMode",
        label: "Developer Mode",
        description: "Extra logging and debug tools.",
        keywords: "debug logs",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($developerMode)}
            onChange={(v) => $developerMode.set(v)}
          />
        ),
      },
    ],
  },
];

export const advancedSection: SectionDef = {
  id: "advanced",
  title: "Advanced",
  icon: AdvancedIcon,
  secondary: true,
  groups: () => groups,
};
