import { useStore } from "@nanostores/react";
import { Fragment } from "react";
import { getExperiment, getVisibleExperiments } from "../../../utils/experiments.ts";
import {
  $ttmlReviewer,
  getOtherLyricsExtensions,
  REVIEWER_EXPERIMENTS_OFF,
  REVIEWER_SETTINGS,
  setTtmlReviewer,
} from "../../../utils/ttmlReviewer.ts";
import { Row, Toggle } from "./components.tsx";

export const REVIEWER_MODE_LABEL = "TTML Reviewer Mode";
export const REVIEWER_MODE_DESCRIPTION =
  "Saves your settings and strips Spicy Lyrics back to basics. Turn it off to get them back exactly as they were.";

/** What each profile key is called in Settings. */
const SETTING_LABELS: Record<string, string> = {
  playbackOffset: "Playback Offset",
  seekFadeCompensation: "Seek Fade-in Compensation",
  scrollLeadEnabled: "Early Scroll",
  smoothScrolling: "Smooth Scrolling",
  animationFpsCapEnabled: "Limit Animation Frame Rate",
  rendererVisualStyle: "Renderer Visual Style",
  simpleLyricsMode: "Simple Lyrics Mode",
  animatorPreset: "Animator Presets",
  spaceGravityMode: "Space Gravity Mode",
  memeFormat: "Unique Word Filters",
  enableExperimentalWordSync: "Experimental Word Sync",
  minimalLyricsMode: "Minimal Lyrics Mode",
  syllableMerge: "Join Split Words",
  lineHoverBackground: "Line Hover Background",
  duetLinePadding: "Wide duet line padding",
  creditsFollowLastLine: "Credits Follow the Last Singer",
  skipSpicyFont: "Skip Spicy Font",
  customFontEnabled: "Use Custom Font",
  staticBackgroundMode: "Background Type",
  staticBackgroundBlur: "Background Blur",
  showNpvDynamicBg: "Display Dynamic Background in Now Playing View",
};

export function ReviewerModeToggle() {
  return <Toggle checked={useStore($ttmlReviewer)} onChange={setTtmlReviewer} />;
}

/** The TTML Reviewer sub-panel: the switch, then everything it does. */
export function ReviewerPane({ onBack }: { onBack: () => void }) {
  const on = useStore($ttmlReviewer);
  const others = on ? getOtherLyricsExtensions() : [];
  const held = new Set<string>(REVIEWER_EXPERIMENTS_OFF);
  const defaulted = getVisibleExperiments().filter((experiment) => !held.has(experiment.id));

  return (
    <div className="slm sl-sp-panel sl-sp-reviewer">
      <div className="sl-sp-subheader"><button className="sl-sp-back-btn" onClick={onBack} aria-label="Back to Settings"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>Settings</button></div>
      <p className="sl-sp-intro">
        Review a sync as it really is, without your setup getting in the way. Everyone in this mode gets the same
        timing and lyric effects.
      </p>

      <div className="sl-sp-card">
        <Row label={REVIEWER_MODE_LABEL} description={REVIEWER_MODE_DESCRIPTION}>
          <ReviewerModeToggle />
        </Row>
      </div>

      {others.length > 0 && (
        <div className="sl-sp-banner" role="status">
          <span>
            {others.join(" and ")} still {others.length > 1 ? "change" : "changes"} your lyrics. Turn{" "}
            {others.length > 1 ? "them" : "it"} off to review.
          </span>
        </div>
      )}

      <div className="sl-sp-group">
        <h3 className="sl-sp-group-title">What it sets</h3>
        <div className="sl-sp-reviewer-list">
          {REVIEWER_SETTINGS.map(({ key, shown }) => (
            <Fragment key={key}>
              <div className="sl-sp-reviewer-item">
                <span>{SETTING_LABELS[key] ?? key}</span>
                <span className="sl-sp-reviewer-value">{shown}</span>
              </div>
              {/* Kept apart from the settings, so the mode skips them rather than resetting them. */}
              {key === "playbackOffset" && (
                <div className="sl-sp-reviewer-item">
                  <span>Per-song Offsets</span>
                  <span className="sl-sp-reviewer-value">Ignored</span>
                </div>
              )}
            </Fragment>
          ))}
          {/* A remote forceState still wins over the mode, and a hidden experiment isn't named here
              any more than in the Experiments list. */}
          {REVIEWER_EXPERIMENTS_OFF.map((id) => getExperiment(id))
            .filter((experiment) => !experiment.hidden)
            .map((experiment) => (
              <div key={experiment.id} className="sl-sp-reviewer-item">
                <span>{experiment.label}</span>
                <span className="sl-sp-reviewer-value">{experiment.forceState === true ? "Forced on" : "Off"}</span>
              </div>
            ))}
          {defaulted.length > 0 && (
            <div className="sl-sp-reviewer-item">
              <span>Other experiments</span>
              <span className="sl-sp-reviewer-value">Default</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
