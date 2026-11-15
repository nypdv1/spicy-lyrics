import { useStore } from "@nanostores/react";
import { $experiment, EXPERIMENT_CATEGORIES, $experimentOverrides, $experimentsSyncing, forcedExperimentState, getAdvancedExperiments, getVisibleExperiments, RefreshExperimentOverrides, setExperiment, type ExperimentId, type ResolvedExperiment } from "../../../utils/experiments.ts";
import { useEffect } from "react";
import { $enableExperimentalWordSync, $externalCinemaLyricsAllowed, $staticBackgroundMode, $staticSyncTarget, type StaticSyncTarget } from "../../../utils/stores.ts";
import { canvasStageBackgroundNote } from "./AppearanceSection.tsx";
import { $ttmlReviewer, REVIEWER_LOCK_REASON } from "../../../utils/ttmlReviewer.ts";
import { Row, Select, SectionTitle, Toggle } from "./components.tsx";

const experimentSettingIds: Partial<Record<ExperimentId, string>> = {
  newSettingsDesign: "appearance-settings-design",
  newProgressBarStyling: "appearance-sliderbar-styling",
  lyricsSkeleton: "lyrics-loading-skeleton",
};

/**
 * The Experiments sub-panel. Renders straight off the EXPERIMENTS registry, so a
 * new experiment shows up here the moment it's added to `utils/experiments.ts`.
 */
export default function ExperimentsPanel({ experimentIds, advancedOnly = false, showBuiltIn = true }: { experimentIds?: readonly ExperimentId[]; advancedOnly?: boolean; showBuiltIn?: boolean }) {
  return <div style={{ padding: "8px 0" }} className="slm w-40">
    <p className="sl-sp-experiments-note">These features are still being shaped. Toggle one off if you prefer how things worked before.</p>
    <ExperimentSettings experimentIds={experimentIds} advancedOnly={advancedOnly} showBuiltIn={showBuiltIn} />
  </div>;
}

export function ExperimentSettings({ title = false, experimentIds, advancedOnly = false, showBuiltIn = true }: { title?: boolean; experimentIds?: readonly ExperimentId[]; advancedOnly?: boolean; showBuiltIn?: boolean }) {
  useStore($experimentOverrides);
  useEffect(() => { void RefreshExperimentOverrides(); }, []);
  const experimentalWordSync = useStore($enableExperimentalWordSync);
  const staticSyncTarget = useStore($staticSyncTarget);
  const externalCinemaLyricsAllowed = useStore($externalCinemaLyricsAllowed);
  const experiments = advancedOnly ? getAdvancedExperiments() : getVisibleExperiments();

  return (
    <>
      {title && <SectionTitle>Experiments</SectionTitle>}
      {experimentIds
        ? experiments.filter((exp) => experimentIds.includes(exp.id)).map((exp) => (
          <ExperimentRow key={exp.id} experiment={exp} />
        ))
        // The full list is grouped under its category headings, in EXPERIMENT_CATEGORIES order.
        : EXPERIMENT_CATEGORIES.map(({ id, title }) => {
          const inCategory = experiments.filter((exp) => exp.category === id);
          if (inCategory.length === 0) return null;
          return <div key={id} className="sl-sp-experiment-group">
            <h4 className="sl-sp-experiment-group-title">{title}</h4>
            {inCategory.map((exp) => <ExperimentRow key={exp.id} experiment={exp} />)}
          </div>;
        })}
      {showBuiltIn && <><Row
        label="Enable Cinema Lyrics Window"
        description="Show or hide the Cinema Lyrics button in the playback bar."
        labelAccessory={
          <a
            className="sl-sp-help-link"
            href="https://github.com/iPixelGalaxy/spicy-lyrics/blob/dev/ENABLE_DEVTOOLS.md"
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            Help
          </a>
        }
      >
        <Toggle checked={externalCinemaLyricsAllowed} onChange={(v) => $externalCinemaLyricsAllowed.set(v)} />
      </Row>
      <Row label="Experimental Word Sync" description="Estimate word sync for line or static lyrics.">
        <Toggle checked={experimentalWordSync} onChange={(v) => $enableExperimentalWordSync.set(v)} />
      </Row>
      <Row label="Unsynced Lyrics Sync" description="What Experimental Word Sync estimates for lyrics without timing: word by word, or whole lines only. Space Gravity always uses words." disabled={!experimentalWordSync} disabledReason="Turn on Experimental Word Sync to change this.">
        <Select value={staticSyncTarget} options={["word", "line"]} labels={["Words", "Lines"]} onChange={(v) => $staticSyncTarget.set(v as StaticSyncTarget)} disabled={!experimentalWordSync} />
      </Row></>}
    </>
  );
}

function ExperimentRow({ experiment }: { experiment: ResolvedExperiment }) {
  const store = $experiment(experiment.id);
  const enabled = useStore(store);
  const forced = forcedExperimentState(experiment.id);
  const syncing = useStore($experimentsSyncing);
  // TTML Reviewer mode holds every experiment where it put it until the mode is turned off.
  const heldByReviewer = useStore($ttmlReviewer);
  const backgroundMode = useStore($staticBackgroundMode);
  // Settings elsewhere that keep the experiment from taking effect.
  const note = experiment.id === "canvasImmersive" && enabled && canvasStageBackgroundNote(backgroundMode);

  return (
    <Row settingId={experimentSettingIds[experiment.id]} label={experiment.label} description={experiment.description} note={note} disabled={syncing || forced !== undefined || heldByReviewer} disabledReason={syncing ? "Refreshing experiments" : forced !== undefined ? (forced ? "Forced on" : "Forced off") : REVIEWER_LOCK_REASON}>
      <Toggle checked={enabled} onChange={(v) => setExperiment(experiment.id, v)} />
    </Row>
  );
}
