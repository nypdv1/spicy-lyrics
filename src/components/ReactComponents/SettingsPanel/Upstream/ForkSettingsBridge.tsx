import React from "react";
import LegacyAppearance from "../AppearanceSection.tsx";
import LegacyEffects from "../EffectsSection.tsx";
import LegacyInterface from "../InterfaceSection.tsx";
import LegacySources from "../SourcesSection.tsx";
import LegacyAdvanced from "../DeveloperSection.tsx";
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from "../settingsCatalog.ts";

/**
 * Compatibility renderer for fork rows. It deliberately uses the existing
 * components, so a fork setting is defined once and appears here automatically
 * instead of becoming a second, drifting implementation in the upstream panel.
 */
const categoryContent: Record<SettingsCategoryId, React.ReactNode> = {
  appearance: <LegacyAppearance query="" sectionFilter="All" />,
  lyrics: null,
  effects: <LegacyEffects query="" sectionFilter="All" />,
  interface: <LegacyInterface query="" sectionFilter="All" />,
  sources: <LegacySources query="" sectionFilter="All" />,
  advanced: <LegacyAdvanced query="" sectionFilter="All" />,
};

export default function ForkSettingsBridge() {
  return <div className="sl-us-fork-settings">
    {SETTINGS_CATEGORIES.map((category) => <React.Fragment key={category.id}>{categoryContent[category.id]}</React.Fragment>)}
  </div>;
}
