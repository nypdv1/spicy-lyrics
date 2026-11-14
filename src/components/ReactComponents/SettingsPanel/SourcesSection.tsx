import React from "react";
import { $hiddenSettingIds, $lrcRedAcceptModelSynced, $lyricsCacheAction, $showLyricsCacheActionButton } from "../../../utils/stores.ts";
import { ModelSyncCurrentSong } from "../../../utils/lrcRedSync.ts";
import { LYRICS_CACHE_ACTIONS, normalizeLyricsCacheAction, RunLyricsCacheAction } from "../../../utils/LyricsCacheTools.ts";
import { LYRICS_SOURCE_PROVIDER_DEFINITIONS } from "../../../utils/Lyrics/LyricsSourcePreferences.ts";
import { OpenTTMLDatabasePanelFromSettings } from "../../../utils/openLyricsDBPanel.tsx";
import { OpenLyricsSourcesManager } from "../../../utils/openLyricsSourcesManager.tsx";
import { matches, Row, SectionTitle, Select, Toggle } from "./components.tsx";
import { useStore } from "@nanostores/react";

const SECTION_NAME = "Sources";

export default function SourcesSection({ query, sectionFilter, showHidden = false }: { query: string; sectionFilter: string; showHidden?: boolean }) {
  const lyricsCacheAction = normalizeLyricsCacheAction(useStore($lyricsCacheAction));
  const showLyricsCacheActionButton = useStore($showLyricsCacheActionButton);
  const hiddenSettingIds = useStore($hiddenSettingIds);
  const lrcRedAcceptModelSynced = useStore($lrcRedAcceptModelSynced);
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;
  const sources = !showHidden && (matches(query, "Manage Sources", "Manage lyric source priority and availability.") || Object.values(LYRICS_SOURCE_PROVIDER_DEFINITIONS).some((source) => matches(query, source.label, source.description)));
  const database = !showHidden && matches(query, "Browse TTML Database", "Open the local TTML database manager.");
  const cacheButton = matches(query, "Lyrics View Cache Button", "Show a selected cache action in the lyrics view controls.") && (!showHidden || hiddenSettingIds.includes("advanced-cache-button"));
  const cacheActions = matches(query, "Cache Actions", "Clear all current-song caches, clear current in-memory lyrics, or clear stored lyrics cache.") && (!showHidden || hiddenSettingIds.includes("advanced-cache-actions"));
  const lrcRedModel = matches(query, "Accept Model-Synced lrc.red Lyrics", "Use lrc.red lyrics synced by its model.") && (!showHidden || hiddenSettingIds.includes("sources-lrcred-model"));
  const lrcRedSync = !showHidden && matches(query, "Model-Sync This Song on lrc.red", "Ask lrc.red to sync the playing song word by word with its model.");
  if (!sources && !database && !cacheButton && !cacheActions && !lrcRedModel && !lrcRedSync) return null;
  return <>
    <SectionTitle>Sources</SectionTitle>
    {sources && <Row label="Manage Sources" description="Manage lyric source priority and availability."><button className="sl-sp-btn" onClick={OpenLyricsSourcesManager}>Manage</button></Row>}
    {lrcRedModel && <Row settingId="sources-lrcred-model" label="Accept Model-Synced lrc.red Lyrics" description="Use lrc.red lyrics that its model synced, credited as lrc.red (model synced). Off skips them, so the next source in the order is used instead."><Toggle checked={lrcRedAcceptModelSynced} onChange={(v) => $lrcRedAcceptModelSynced.set(v)} /></Row>}
    {lrcRedSync && <Row label="Model-Sync This Song on lrc.red" description="Ask lrc.red to sync the playing song word by word with its model, and show the result right away. Takes a moment; the song needs an ISRC on Spotify."><button className="sl-sp-btn" type="button" onClick={() => void ModelSyncCurrentSong()}>Sync</button></Row>}
    {database && <Row label="Browse TTML Database" description="Open the local TTML database manager."><button className="sl-sp-btn" onClick={OpenTTMLDatabasePanelFromSettings}>Browse</button></Row>}
    {cacheButton && <Row settingId="advanced-cache-button" label="Lyrics View Cache Button" description="Show selected cache action in the lyrics view controls."><div className="sl-sp-btn-group"><Select value={lyricsCacheAction} options={LYRICS_CACHE_ACTIONS.map((action) => action.value)} labels={LYRICS_CACHE_ACTIONS.map((action) => action.label)} onChange={(value) => $lyricsCacheAction.set(normalizeLyricsCacheAction(value))} /><Toggle checked={showLyricsCacheActionButton} onChange={(value) => $showLyricsCacheActionButton.set(value)} /></div></Row>}
    {cacheActions && <Row settingId="advanced-cache-actions" label="Cache Actions" description="Clear all current-song caches, clear current in-memory lyrics, or clear stored lyrics cache."><div className="sl-sp-btn-group"><button className="sl-sp-btn" onClick={() => void RunLyricsCacheAction("all-current", true)}>Clear All</button><button className="sl-sp-btn" onClick={() => void RunLyricsCacheAction("current-state", true)}>Clear Current Song</button><button className="sl-sp-btn" onClick={() => void RunLyricsCacheAction("stored-cache", true)}>Clear Cache</button></div></Row>}
  </>;
}
