import { useStore } from "@nanostores/react";
import React from "react";
import { $allowHidingSettings, $developerMode, $rememberSettingsMenuLocation } from "../../../utils/stores.ts";
import { OpenBuildChannelManager } from "../../../utils/openBuildChannelPanel.tsx";
import { BuildChannelSettingControl } from "../BuildChannelPanel.tsx";
import { $experimentOverrides, getAdvancedExperiments } from "../../../utils/experiments.ts";
import { OpenAdvancedExperiments } from "../../../utils/openAdvancedExperiments.tsx";
import { matches, Row, SectionTitle, Toggle } from "./components.tsx";
import { REVIEWER_MODE_DESCRIPTION, REVIEWER_MODE_LABEL, ReviewerModeToggle } from "./ReviewerSection.tsx";
import { CopyReportButton } from "./BugReportSection.tsx";

export type SettingsSubPane = "reviewer" | "bug";

const SECTION_NAME = "Advanced";

export default function DeveloperSection({ query, sectionFilter, onOpenHiddenSettings = () => {}, onOpenPane = () => {}, showHidden = false }: { query: string; sectionFilter: string; onOpenHiddenSettings?: () => void; onOpenPane?: (pane: SettingsSubPane) => void; showHidden?: boolean }) {
  useStore($experimentOverrides);
  const developerMode = useStore($developerMode);
  const allowHidingSettings = useStore($allowHidingSettings);
  const rememberSettingsMenuLocation = useStore($rememberSettingsMenuLocation);
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;
  const developerModeHit = matches(query, "Developer Mode", "Enable extra logging and debug utilities.");
  const buildChannelHit = matches(query, "Build Channel", "Select a branch or manage saved branches.");
  const experimentsHit = matches(query, "Experiments", "Try out in-progress features.") || getAdvancedExperiments().some((exp) => matches(query, exp.label, exp.description));
  const hidingHit = matches(query, "Show Hide Settings Tab", "Show the Hide Settings action and eye buttons beside settings.");
  const manageHiddenHit = matches(query, "Manage Hidden Settings", "Restore settings hidden from the main panel.");
  const rememberLocationHit = matches(query, "Remember Menu Location After Close", "Reopen Settings at the tab or submenu you last used.");
  const reviewerHit = matches(query, REVIEWER_MODE_LABEL, `${REVIEWER_MODE_DESCRIPTION} review sync ttml basics`);
  const bugHit = matches(query, "Bug Report", "Copy your setup to paste in #extension-bugs on Discord. bug issue problem broken help support diagnostics");
  if (showHidden || (!developerModeHit && !buildChannelHit && !experimentsHit && !hidingHit && !manageHiddenHit && !rememberLocationHit && !reviewerHit && !bugHit)) return null;
  return <>
    <SectionTitle>Advanced</SectionTitle>
    {!showHidden && buildChannelHit && <Row label="Build Channel" description="Select a branch or manage saved branches."><BuildChannelSettingControl onManage={OpenBuildChannelManager} /></Row>}
    {!showHidden && hidingHit && <Row label="Show Hide Settings Tab" description="Show the Hide Settings action and eye buttons beside settings."><Toggle checked={allowHidingSettings} onChange={(value) => $allowHidingSettings.set(value)} /></Row>}
    {!showHidden && manageHiddenHit && <Row label="Manage Hidden Settings" description="Restore settings hidden from the main panel."><button className="sl-sp-btn" type="button" onClick={onOpenHiddenSettings}>Manage</button></Row>}
    {!showHidden && rememberLocationHit && <Row label="Remember Menu Location After Close" description="Reopen Settings at the tab or submenu you last used."><Toggle checked={rememberSettingsMenuLocation} onChange={(value) => $rememberSettingsMenuLocation.set(value)} /></Row>}
    {!showHidden && reviewerHit && <Row label={REVIEWER_MODE_LABEL} description={REVIEWER_MODE_DESCRIPTION}><span style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="sl-sp-btn" type="button" onClick={() => onOpenPane("reviewer")}>Details</button><ReviewerModeToggle /></span></Row>}
    {!showHidden && bugHit && <Row label="Bug Report" description="Copy your setup to paste in #extension-bugs on our Discord, with what went wrong. No account details, user IDs or tokens are included."><span style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="sl-sp-btn" type="button" onClick={() => onOpenPane("bug")}>Preview</button><CopyReportButton /></span></Row>}
    {developerModeHit && <Row label="Developer Mode" description="Enable extra logging and debug utilities."><Toggle checked={developerMode} onChange={(value) => $developerMode.set(value)} /></Row>}
    {!showHidden && experimentsHit && <Row label="Experiments" description="Try out in-progress features, and switch back if you prefer the old behaviour."><button className="sl-sp-btn" type="button" onClick={OpenAdvancedExperiments}>Manage</button></Row>}
  </>;
}
