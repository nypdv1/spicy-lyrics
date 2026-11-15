import { useStore } from "@nanostores/react";
import type React from "react";
import {
  EXPERIMENT_CATEGORIES,
  type ExperimentCategory,
  getVisibleExperiments,
  RefreshExperimentOverrides,
} from "../../../../utils/experiments.ts";
import { $enableExperimentalWordSync, $staticSyncTarget, type StaticSyncTarget } from "../../../../utils/stores.ts";
import { Select, Toggle } from "./components.tsx";
import { ExperimentRow, SyncStatus } from "./ExperimentsPanel.tsx";
import { ExperimentsIcon } from "./icons.tsx";
import type { SectionDef, SettingDef } from "./model.ts";

// Experimental settings that predate the registry and keep their own stores,
// listed first under their category.
const STANDALONE: Partial<Record<ExperimentCategory, SettingDef[]>> = {
  lyrics: [
    {
      id: "enableExperimentalWordSync",
      label: "Experimental Word Sync",
      description: "Estimate word sync for line or static lyrics.",
      keywords: "experiment lyrics word sync estimate karaoke line static unsynced",
      Control: ({ label }) => (
        <Toggle
          label={label}
          checked={useStore($enableExperimentalWordSync)}
          onChange={(v) => $enableExperimentalWordSync.set(v)}
        />
      ),
    },
    {
      id: "staticSyncTarget",
      label: "Unsynced Lyrics Sync",
      description:
        "What Experimental Word Sync estimates for lyrics without timing: word by word, or whole lines only. Lines are steadier; words can drift inside a line. Space Gravity always uses words.",
      keywords: "experiment static plain unsynced lyrics line word estimate timing",
      useDisabled: () =>
        !useStore($enableExperimentalWordSync) && "Turn on Experimental Word Sync to change this.",
      Control: ({ disabled, label }) => (
        <Select
          label={label}
          value={useStore($staticSyncTarget)}
          options={["word", "line"]}
          labels={["Words", "Lines"]}
          onChange={(v) => $staticSyncTarget.set(v as StaticSyncTarget)}
          disabled={disabled}
        />
      ),
    },
  ],
};

export const experimentsSection: SectionDef = {
  id: "experiments",
  title: "Experiments",
  icon: ExperimentsIcon,
  intro: "Features still being shaped. Turn one off if you prefer how things worked before.",
  emptyText: "No experiments right now.",
  Accessory: SyncStatus,
  // Before the tab renders, so its first frame is already locked and loading.
  onEnter: () => void RefreshExperimentOverrides(),
  // Rebuilt each render so remote overrides (labels, hidden rows) show at once.
  // The rows stay mounted across rebuilds: they are keyed by id, and `render`
  // returns an element of the same ExperimentRow type every time.
  // One group per category with anything in it, in EXPERIMENT_CATEGORIES order.
  groups: () => {
    const visible = getVisibleExperiments();
    return EXPERIMENT_CATEGORIES.map(({ id, title }) => ({
      title,
      settings: [
        ...(STANDALONE[id] ?? []),
        ...visible
          .filter((experiment) => experiment.category === id)
          .map((experiment) => ({
            id: `experiment:${experiment.id}`,
            label: experiment.label,
            description: experiment.description,
            keywords: `experiment ${title.toLowerCase()}`,
            render: (label: React.ReactNode, searching: boolean) => (
              <ExperimentRow experiment={experiment} label={label} searching={searching} />
            ),
          })),
      ],
    })).filter((group) => group.settings.length > 0);
  },
};
