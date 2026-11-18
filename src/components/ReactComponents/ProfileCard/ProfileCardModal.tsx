import React from "react";
import ReactDOM from "react-dom/client";
import { Query } from "../../../utils/API/Query.ts";
import { PROFILE_CARD_CSS } from "./profileCardStyles.ts";
import { findLinkBrand, WEBSITE_ICON_PATH } from "./linkBrands.ts";

// Serves contributor profiles as JSON, read from their public profile pages and cached.
const PROFILE_SERVICE = "https://fork.nypd594.workers.dev/profile";
// The JSON shape this card reads; asking for it by name skips copies the browser cached in an older shape.
const PROFILE_FORMAT = 3;
const PROFILE_SITE = "https://spicylyrics.org";
// A first look-up scrapes the page, which takes a few seconds; cached ones are instant.
const PROFILE_TIMEOUT_MS = 15_000;
const USERNAME_CACHE_MS = 5 * 60_000;
const USERNAME_RETRY_MS = 30_000;
const PROFILE_CACHE_MS = 10 * 60_000;

export interface ProfileIdentity {
  username: string;
  displayName?: string;
}

const usernameCache = new Map<string, { profile: ProfileIdentity | null; expires: number }>();
const usernameRequests = new Map<string, Promise<ProfileIdentity | null>>();

const readString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

export function resolveProfileIdentity(userId: string): Promise<ProfileIdentity | null> {
  const cached = usernameCache.get(userId);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.profile);
  const pending = usernameRequests.get(userId);
  if (pending) return pending;

  const request = Query([{
    operation: "ttmlProfile",
    variables: { userId, referrer: "lyricsCreditsView" },
  }])
    .then((result) => {
      const profile = result.get("0")?.data?.profile?.data;
      const username = readString(profile?.username, profile?.user?.username);
      if (!username) return null;
      return {
        username,
        displayName: readString(
          profile?.globalName,
          profile?.global_name,
          profile?.displayName,
          profile?.display_name,
          profile?.user?.globalName,
          profile?.user?.global_name,
          profile?.user?.displayName,
          profile?.user?.display_name,
        ),
      };
    })
    .catch((): ProfileIdentity | null => null)
    .then((profile) => {
      usernameCache.set(userId, {
        profile,
        expires: Date.now() + (profile ? USERNAME_CACHE_MS : USERNAME_RETRY_MS),
      });
      return profile;
    })
    .finally(() => usernameRequests.delete(userId));
  usernameRequests.set(userId, request);
  return request;
}

export function resolveProfileUsername(userId: string): Promise<string | null> {
  return resolveProfileIdentity(userId).then((profile) => profile?.username ?? null);
}

export function profilePageUrl(username: string): string {
  return `${PROFILE_SITE}/${encodeURIComponent(username)}`;
}

export type ProfileTrack = {
  id: string;
  /** Opened in the browser instead of playing the Spotify track `id`. */
  url?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: string;
  views?: string;
  releases?: number;
  coverUrl?: string;
};

export type Profile = {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  /** Pronouns or a short status, shown beside the handle. */
  tag?: string;
  /** The profile's own colours, as "r, g, b" triples. */
  theme?: { accent?: string; angle?: number; colors?: [string, string] };
  links: Array<{ label: string; url: string }>;
  views: { makes?: string; uploads?: string };
  counts: { makes?: number; uploads?: number };
  trackCount: number;
  tracks: ProfileTrack[];
  profileUrl: string;
  statsUrl?: string;
  /** Badges the profile shows off, as icons beside the handle. */
  badges?: Array<{ key: string; name: string; description?: string; iconUrl: string }>;
  /** Replaces the Made / Uploaded figures. */
  figures?: Array<{ label: string; value: string }>;
  /** Heading over the track list; "Most viewed" when unset. */
  tracksTitle?: string;
  /** Where the tracks past the list live; "spicylyrics.org" when unset. */
  siteName?: string;
};

const profileCache = new Map<string, { profile: Profile; expires: number }>();

async function readProfile(key: string, url: string, signal: AbortSignal): Promise<Profile | null> {
  const cached = profileCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.profile;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const body = await res.json();
  const profile = body?.profile as Profile | null;
  if (!profile?.username) return null;
  profileCache.set(key, { profile, expires: Date.now() + PROFILE_CACHE_MS });
  return profile;
}

function fetchProfile(username: string, signal: AbortSignal): Promise<Profile | null> {
  return readProfile(
    username.toLowerCase(),
    `${PROFILE_SERVICE}/${encodeURIComponent(username)}?format=${PROFILE_FORMAT}`,
    signal
  );
}

// The card opens straight from the credit's account id: the worker reads the profile page
// for that id, so there's no username lookup before it.
function fetchProfileById(userId: string, signal: AbortSignal): Promise<Profile | null> {
  return readProfile(
    `uid:${userId}`,
    `${PROFILE_SERVICE}/uid/${encodeURIComponent(userId)}?format=${PROFILE_FORMAT}`,
    signal
  );
}

/**
 * A Spicy Lyrics profile's avatar, for credits that only know the account id. Loads the whole
 * profile (cached here and by the worker), so opening its card afterwards is instant.
 */
export async function resolveProfileAvatar(userId: string): Promise<string | null> {
  const username = await resolveProfileUsername(userId);
  if (!username) return null;
  const profile = await fetchProfile(username, AbortSignal.timeout(PROFILE_TIMEOUT_MS)).catch(() => null);
  return profile?.avatarUrl ?? null;
}

const RGB_TRIPLE = /^\d{1,3}, \d{1,3}, \d{1,3}$/;

/** CSS variables that paint the card in the profile's colours; empty when it has none. */
function themeStyle(theme: Profile["theme"]): React.CSSProperties {
  const style: Record<string, string> = {};
  const accent = theme?.accent;
  const colors = theme?.colors;
  if (accent && RGB_TRIPLE.test(accent)) style["--pc-accent-rgb"] = accent;
  if (colors && colors.every((color) => RGB_TRIPLE.test(color))) {
    const angle = Number.isFinite(theme?.angle) ? theme?.angle : 135;
    style["--pc-theme"] = `linear-gradient(${angle}deg, rgba(${colors[0]}, 0.6), rgba(${colors[1]}, 0.6))`;
  }
  return style as React.CSSProperties;
}

const openExternal = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

// "X (formerly Twitter)" reads as "X".
function shortLinkLabel(link: { label: string; url: string }): string {
  const label = link.label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (label) return label;
  try {
    return new URL(link.url).hostname.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

function LinkIcon({ link }: { link: { label: string; url: string } }) {
  const brand = findLinkBrand(link.url);
  const label = brand?.name ?? shortLinkLabel(link);
  return (
    <a
      className="sl-pc-link"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      style={brand ? { background: brand.background, color: brand.color } : undefined}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path d={brand?.path ?? WEBSITE_ICON_PATH} fill="currentColor" />
      </svg>
    </a>
  );
}

function Figure({ count, label, views }: { count?: number; label: string; views?: string }) {
  if (count === undefined && !views) return null;
  return (
    <div className="sl-pc-figure">
      <dt>{label}</dt>
      <dd>
        <span className="sl-pc-figure-count">{count ?? "–"}</span>
        {views && <span className="sl-pc-figure-views">{views} views</span>}
      </dd>
    </div>
  );
}

function TrackRow({ track, rank, onPlay }: { track: ProfileTrack; rank: number; onPlay: (id: string) => void }) {
  const title = track.title ?? "Untitled";
  return (
    <li>
      <button
        type="button"
        className="sl-pc-track"
        onClick={() => (track.url ? openExternal(track.url) : onPlay(track.id))}
        aria-label={`${track.url ? "Open" : "Play"} ${title}${track.artist ? ` by ${track.artist}` : ""}`}
      >
        <span className="sl-pc-rank" aria-hidden="true">{rank}</span>
        <span className="sl-pc-cover" aria-hidden="true">
          {track.coverUrl && <img src={track.coverUrl} alt="" loading="lazy" draggable={false} />}
          <svg className="sl-pc-play" viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z" fill="currentColor" />
          </svg>
        </span>
        <span className="sl-pc-track-text">
          <span className="sl-pc-track-title">
            {title}
            {track.releases && track.releases > 1 ? (
              <span className="sl-pc-releases" title={`${track.releases} releases`}>×{track.releases}</span>
            ) : null}
          </span>
          {track.artist && <span className="sl-pc-track-artist">{track.artist}</span>}
        </span>
        {track.views && <span className="sl-pc-track-views">{track.views}</span>}
      </button>
    </li>
  );
}

function ProfileCard({ profile, onClose, onPlay }: {
  profile: Profile;
  onClose: () => void;
  onPlay: (id: string) => void;
}) {
  const name = profile.displayName || profile.username;
  const hiddenOnPage = profile.trackCount - profile.tracks.length;

  return (
    <div className="sl-pc-backdrop" onClick={onClose}>
      <div
        className="sl-pc-card"
        style={themeStyle(profile.theme)}
        role="dialog"
        aria-modal="true"
        aria-label={`${name}'s profile`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="sl-pc-close" onClick={onClose} aria-label="Close profile">
          <svg width="12" height="12" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fillRule="evenodd" />
          </svg>
        </button>

        <div className="sl-pc-body">
          <div className="sl-pc-banner" aria-hidden="true">
            {profile.bannerUrl && <img src={profile.bannerUrl} alt="" draggable={false} />}
          </div>

          <header className="sl-pc-header">
            <div className="sl-pc-avatar" aria-hidden="true">
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="" draggable={false} />
                : <span>{name.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="sl-pc-identity">
              <h2 className="sl-pc-name">{name}</h2>
              <p className="sl-pc-username">
                <span>@{profile.username}</span>
                {profile.tag && <span className="sl-pc-tag">{profile.tag}</span>}
              </p>
            </div>
            {profile.badges && profile.badges.length > 0 && (
              <ul className="sl-pc-badges" aria-label="Badges">
                {profile.badges.map((badge) => (
                  <li key={badge.key} className="sl-pc-badge" tabIndex={0} aria-label={badge.name}>
                    <img src={badge.iconUrl} alt="" draggable={false} />
                    <span className="sl-pc-badge-tip" role="tooltip">
                      <strong>{badge.name}</strong>
                      {badge.description && <span>{badge.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </header>

          {profile.links.length > 0 && (
            <div className="sl-pc-links">
              {profile.links.map((link) => <LinkIcon key={link.url} link={link} />)}
            </div>
          )}

          <dl className="sl-pc-figures">
            {profile.figures
              ? profile.figures.map((figure) => (
                  <div key={figure.label} className="sl-pc-figure">
                    <dt>{figure.label}</dt>
                    <dd><span className="sl-pc-figure-count">{figure.value}</span></dd>
                  </div>
                ))
              : <>
                  <Figure label="Made" count={profile.counts.makes} views={profile.views.makes} />
                  <Figure label="Uploaded" count={profile.counts.uploads} views={profile.views.uploads} />
                </>}
          </dl>

          {profile.tracks.length > 0 && (
            <section className="sl-pc-tracks" aria-label="Tracks">
              <div className="sl-pc-section-head">
                <h3>{profile.tracksTitle ?? "Most viewed"}</h3>
                <span>{profile.trackCount} {profile.trackCount === 1 ? "track" : "tracks"}</span>
              </div>
              <div className="sl-pc-list">
                <ol>
                  {profile.tracks.map((track, index) => (
                    <TrackRow key={track.id} track={track} rank={index + 1} onPlay={onPlay} />
                  ))}
                </ol>
                {hiddenOnPage > 0 && (
                  <button type="button" className="sl-pc-more" onClick={() => openExternal(profile.profileUrl)}>
                    {hiddenOnPage} more on {profile.siteName ?? "spicylyrics.org"}
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        <footer className="sl-pc-footer">
          <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer">Open profile</a>
          {profile.statsUrl && (
            <a href={profile.statsUrl} target="_blank" rel="noopener noreferrer">Profile stats</a>
          )}
        </footer>
      </div>
    </div>
  );
}

type ProfileState = "loading" | "ready" | "failed" | "closed";
interface ProfileOptions {
  signal: AbortSignal;
  onState: (state: ProfileState) => void;
  /** Loads the profile from somewhere other than Spicy Lyrics; `userId` then only keys the session. */
  load?: (signal: AbortSignal) => Promise<Profile | null>;
}

interface ProfileSession {
  userId: string;
  document: Document;
  close: () => void;
}

let activeSession: ProfileSession | null = null;

export function closeProfileModal(userId?: string) {
  if (!userId || activeSession?.userId === userId) activeSession?.close();
}

function ensureStyles(targetDocument: Document) {
  if (targetDocument.getElementById("sl-profile-card-styles")) return;
  const style = targetDocument.createElement("style");
  style.id = "sl-profile-card-styles";
  style.textContent = PROFILE_CARD_CSS;
  targetDocument.head.appendChild(style);
}

/** Looks the profile up, then shows it as a card over the page. */
export function showProfileModal(
  userId: string,
  targetDocument: Document,
  options: ProfileOptions,
) {
  if (options.signal.aborted) return;
  if (activeSession?.userId === userId && activeSession.document === targetDocument) return;
  closeProfileModal();

  const targetWindow = targetDocument.defaultView ?? window;
  const lookup = new AbortController();
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof ReactDOM.createRoot> | null = null;
  let closed = false;
  let shown = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(deadline);
    lookup.abort();
    options.signal.removeEventListener("abort", onAbort);
    targetWindow.removeEventListener("keydown", onKeyDown, true);
    root?.unmount();
    container?.remove();
    if (activeSession === session) activeSession = null;
    options.onState("closed");
  };
  const fail = () => {
    if (closed) return;
    close();
    options.onState("failed");
  };
  // Leaving the lyrics cancels a profile still loading; one already open stays.
  const onAbort = () => {
    if (!shown) close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !shown) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  };
  const play = (trackId: string) => {
    close();
    Spicetify.Player.playUri(`spotify:track:${trackId}`);
  };

  const session: ProfileSession = { userId, document: targetDocument, close };
  activeSession = session;
  options.signal.addEventListener("abort", onAbort, { once: true });
  targetWindow.addEventListener("keydown", onKeyDown, true);
  options.onState("loading");
  deadline = setTimeout(fail, PROFILE_TIMEOUT_MS);

  const loading = options.load
    ? options.load(lookup.signal)
    : fetchProfileById(userId, lookup.signal);
  void loading
    .catch(() => null)
    .then((profile) => {
      if (closed || options.signal.aborted) return;
      if (!profile) {
        fail();
        return;
      }
      clearTimeout(deadline);
      ensureStyles(targetDocument);
      container = targetDocument.createElement("div");
      container.className = "sl-pc-host";
      // The card sits outside <body>, so it takes Spotify's font from there.
      container.style.fontFamily = targetWindow.getComputedStyle(targetDocument.body).fontFamily;
      targetDocument.documentElement.appendChild(container);
      root = ReactDOM.createRoot(container);
      root.render(<ProfileCard profile={profile} onClose={close} onPlay={play} />);
      shown = true;
      options.onState("ready");
    });
}
