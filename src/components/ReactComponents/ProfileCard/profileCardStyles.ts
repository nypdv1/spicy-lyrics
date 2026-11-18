// Injected into the document the card opens in, so it also styles the popup window.
export const PROFILE_CARD_CSS = `
.sl-pc-host {
  position: fixed;
  inset: 0;
  z-index: 9999;
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
}
.sl-pc-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
  animation: sl-pc-fade 160ms ease-out;
}
.sl-pc-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100% - 32px));
  max-height: min(86vh, calc(100% - 48px));
  overflow: hidden;
  color: #fff;
  /* The profile's gradient, under a dark wash that deepens downward so text stays readable. */
  background:
    linear-gradient(180deg, rgba(14, 12, 17, 0.3), rgba(14, 12, 17, 0.74) 40%, rgba(14, 12, 17, 0.88)),
    var(--pc-theme, none),
    #151317;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7);
  animation: sl-pc-rise 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
/* Everything but the footer. The track list takes the leftover height and scrolls itself;
   the body only scrolls when the window is too short to fit the list's minimum. */
.sl-pc-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sl-pc-body, .sl-pc-list {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}
.sl-pc-banner, .sl-pc-header, .sl-pc-links, .sl-pc-figures { flex: none; }
.sl-pc-close {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}
.sl-pc-close:hover { background: rgba(0, 0, 0, 0.72); }

/* The image is taken out of flow so its own size can't stretch the banner past 3:1;
   a tall or square banner is cropped to fit. */
.sl-pc-banner {
  position: relative;
  aspect-ratio: 3 / 1;
  width: 100%;
  overflow: hidden;
  background: linear-gradient(135deg, #3a2f52, #1f2a44);
}
.sl-pc-banner img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Out of flow, on the banner's lower edge beside the avatar, so badges never move the layout.
   The header starts 42px above the banner's bottom; the pill sits in that band. */
.sl-pc-badges {
  position: absolute;
  top: 6px;
  right: 20px;
  display: flex;
  gap: 4px;
  max-width: calc(100% - 140px);
  margin: 0;
  padding: 4px 6px;
  list-style: none;
  background: rgba(14, 12, 17, 0.55);
  backdrop-filter: blur(8px);
  border-radius: 999px;
}
.sl-pc-badge {
  position: relative;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  outline: none;
}
.sl-pc-badge img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 140ms ease-out;
}
.sl-pc-badge:hover img, .sl-pc-badge:focus-visible img { transform: scale(1.1); }
.sl-pc-badge:focus-visible { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8); }
/* Opens below the icon, so the top of the card can't cut it off. */
.sl-pc-badge-tip {
  position: absolute;
  top: calc(100% + 10px);
  right: -6px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: max-content;
  max-width: 220px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.75);
  background: #232027;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 120ms ease-out, transform 120ms ease-out, visibility 0s linear 120ms;
}
.sl-pc-badge-tip strong { font-size: 13px; font-weight: 700; color: #fff; }
.sl-pc-badge:hover .sl-pc-badge-tip, .sl-pc-badge:focus-visible .sl-pc-badge-tip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  transition: opacity 120ms ease-out, transform 120ms ease-out, visibility 0s;
}

.sl-pc-header {
  /* Above the banner (positioned, so it would otherwise paint over the avatar it overlaps). */
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-top: -42px;
  padding: 0 20px;
}
.sl-pc-avatar {
  flex: none;
  width: 84px;
  height: 84px;
  overflow: hidden;
  background: #2a2730;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(14, 12, 17, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
}
.sl-pc-avatar img { width: 100%; height: 100%; object-fit: cover; }
/* The avatar rides up over the banner; the name starts just below it. */
.sl-pc-identity { min-width: 0; padding-top: 50px; }
.sl-pc-name {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.sl-pc-username {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 3px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}
.sl-pc-tag {
  padding: 2px 9px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(var(--pc-accent-rgb, 255, 255, 255), 0.16);
  border: 1px solid rgba(var(--pc-accent-rgb, 255, 255, 255), 0.4);
  border-radius: 999px;
  overflow-wrap: anywhere;
}

.sl-pc-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 20px 0;
}
.sl-pc-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  /* Keeps black icons (X, TikTok) visible on dark themes. */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  transition: transform 140ms ease-out, filter 140ms ease-out;
}
.sl-pc-link:hover { transform: translateY(-1px) scale(1.06); filter: brightness(1.08); }
.sl-pc-link:active { transform: scale(0.96); }

.sl-pc-figures {
  display: grid;
  /* Two figures for Spicy Lyrics, four for Unison; each takes an equal column. */
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 8px;
  margin: 16px 20px 0;
}
.sl-pc-figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
.sl-pc-figure dt {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}
.sl-pc-figure dd {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.sl-pc-figure-count { font-size: 20px; font-weight: 700; }
.sl-pc-figure-views { font-size: 13px; color: rgba(255, 255, 255, 0.6); }

.sl-pc-tracks {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 180px;
  padding: 18px 12px 0;
}
.sl-pc-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 8px;
}
.sl-pc-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 8px 6px;
}
.sl-pc-section-head h3 { margin: 0; font-size: 15px; font-weight: 700; }
.sl-pc-section-head span { font-size: 12px; color: rgba(255, 255, 255, 0.55); }
.sl-pc-tracks ol { margin: 0; padding: 0; list-style: none; }
.sl-pc-track {
  display: grid;
  grid-template-columns: 22px 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 6px 8px;
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 100ms ease-out;
}
.sl-pc-track:hover { background: rgba(255, 255, 255, 0.07); }
.sl-pc-track:focus-visible, .sl-pc-link:focus-visible, .sl-pc-close:focus-visible, .sl-pc-more:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.sl-pc-rank {
  font-size: 13px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
}
.sl-pc-cover {
  position: relative;
  width: 40px;
  height: 40px;
  overflow: hidden;
  background: #2a2730;
  border-radius: 4px;
}
.sl-pc-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sl-pc-play {
  position: absolute;
  inset: 0;
  margin: auto;
  color: #fff;
  opacity: 0;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
  transition: opacity 100ms ease-out;
}
.sl-pc-track:hover .sl-pc-play, .sl-pc-track:focus-visible .sl-pc-play { opacity: 1; }
.sl-pc-track:hover .sl-pc-cover img { filter: brightness(0.55); }
.sl-pc-track-text { display: flex; flex-direction: column; min-width: 0; }
.sl-pc-track-title, .sl-pc-track-artist {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sl-pc-track-title { font-size: 14px; font-weight: 500; }
.sl-pc-track-artist { font-size: 12.5px; color: rgba(255, 255, 255, 0.6); }
.sl-pc-releases {
  margin-left: 6px;
  padding: 1px 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  vertical-align: 1px;
}
.sl-pc-track-views {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.55);
  font-variant-numeric: tabular-nums;
}
.sl-pc-more {
  margin: 4px 8px 0;
  padding: 6px 0;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  background: none;
  border: none;
  cursor: pointer;
}
.sl-pc-more:hover { color: #fff; }

.sl-pc-footer {
  flex: none;
  display: flex;
  gap: 18px;
  padding: 14px 20px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(14, 12, 17, 0.55);
}
.sl-pc-footer a {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
}
.sl-pc-footer a:hover { color: #fff; text-decoration: underline; }

@keyframes sl-pc-fade { from { opacity: 0; } }
@keyframes sl-pc-rise { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
@media (prefers-reduced-motion: reduce) {
  .sl-pc-backdrop, .sl-pc-card { animation: none; }
  .sl-pc-link, .sl-pc-link:hover, .sl-pc-link:active { transform: none; transition: none; }
  .sl-pc-badge img, .sl-pc-badge-tip { transition: none; }
  .sl-pc-badge:hover img, .sl-pc-badge:focus-visible img { transform: none; }
}
`;
