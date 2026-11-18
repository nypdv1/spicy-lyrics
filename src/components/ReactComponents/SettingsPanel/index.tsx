import { useStore } from "@nanostores/react";
import React from "react";
import { $useUpstreamSettingsLayout } from "../../../utils/stores.ts";
import LegacyPanel from "./LegacyPanel.tsx";
import UpstreamSettingsPanel from "./UpstreamSettingsPanel.tsx";

export type { SettingsPanelState } from "./LegacyPanel.tsx";

export default function SettingsPanel(props: React.ComponentProps<typeof LegacyPanel>) {
  const useUpstreamLayout = useStore($useUpstreamSettingsLayout);
  return useUpstreamLayout
    ? <UpstreamSettingsPanel onManageAnimator={props.onManageAnimator && (() => props.onManageAnimator?.(props.initialState ?? { query: "", sectionFilter: "Appearance", scrollTop: 0 }))} />
    : <LegacyPanel {...props} />;
}
