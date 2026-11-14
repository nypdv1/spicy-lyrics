import { useStore } from "@nanostores/react";
import { $lrcRedAcceptModelSynced } from "../../../../utils/stores.ts";
import { ModelSyncCurrentSong } from "../../../../utils/lrcRedSync.ts";
import { OpenTTMLDatabasePanelFromSettings } from "../../../../utils/openLyricsDBPanel.tsx";
import { OpenLyricsSourcesManager } from "../../../../utils/openLyricsSourcesManager.tsx";
import { Toggle } from "./components.tsx";
import { SourcesIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

const groups: GroupDef[] = [
  {
    title: "Lyrics Sources",
    settings: [
      {
        id: "manageLyricsSources",
        label: "Manage Sources",
        description: "Choose which lyric providers can be used and set their priority order.",
        keywords: "provider priority source order",
        Control: () => <button type="button" className="sl-sp-btn" onClick={OpenLyricsSourcesManager}>Manage</button>,
      },
      {
        id: "acceptLrcRedModelSync",
        label: "Accept Model-Synced lrc.red Lyrics",
        description: "Allow word-synced lrc.red results created by its sync model.",
        keywords: "lrc red model sync words timing",
        Control: ({ label }) => (
          <Toggle label={label} checked={useStore($lrcRedAcceptModelSynced)} onChange={(value) => $lrcRedAcceptModelSynced.set(value)} />
        ),
      },
      {
        id: "modelSyncCurrentSong",
        label: "Model-Sync This Song on lrc.red",
        description: "Ask lrc.red to generate word timing for the currently playing song.",
        keywords: "lrc red sync current song word timing",
        Control: () => <button type="button" className="sl-sp-btn" onClick={() => void ModelSyncCurrentSong()}>Sync</button>,
      },
      {
        id: "browseTtmlDatabase",
        label: "Browse TTML Database",
        description: "Open the local TTML lyrics database manager.",
        keywords: "database local lyrics ttml",
        Control: () => <button type="button" className="sl-sp-btn" onClick={OpenTTMLDatabasePanelFromSettings}>Browse</button>,
      },
    ],
  },
];

export const sourcesSection: SectionDef = {
  id: "sources",
  title: "Sources",
  icon: SourcesIcon,
  groups: () => groups,
};
