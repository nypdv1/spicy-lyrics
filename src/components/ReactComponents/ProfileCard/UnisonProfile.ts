import { UNISON_ORIGIN, unisonProfileUrl } from "../../../utils/Lyrics/Sources/Unison.ts";
import type { Profile, ProfileTrack } from "./ProfileCardModal.tsx";

// A Unison submitter's card: /leaderboard/users/<keyId> has the profile and its figures,
// /users/<keyId>/submissions their latest lyrics. Neither needs a key.
const TRACK_LIMIT = 50;
const CACHE_MS = 10 * 60_000;

type UnisonUser = {
  keyId?: string;
  displayName?: string;
  handle?: string;
  avatarUrl?: string;
  banner?: { artworkUrl?: string } | null;
  rank?: number;
  ranked?: boolean;
  submissionCount?: number;
  totalUpvotes?: number;
  level?: number;
  tier?: string;
  topBadge?: { name?: string } | null;
  featured?: Array<{ key?: string; name?: string; tier?: number }>;
};

type CatalogueBadge = {
  key: string;
  name?: string;
  description?: string;
  image?: { color?: string };
  tiers?: Array<{ level: number; threshold?: number; image?: { color?: string } }>;
};

// The badge catalogue changes rarely; one copy a session, retried if it failed.
let catalogue: Promise<Map<string, CatalogueBadge>> | null = null;
function getCatalogue(signal: AbortSignal): Promise<Map<string, CatalogueBadge>> {
  catalogue ??= getData<{ badges?: CatalogueBadge[] }>("/badges", signal)
    .then((data) => new Map((data?.badges ?? []).map((badge) => [badge.key, badge])))
    .catch(() => {
      catalogue = null;
      return new Map();
    });
  return catalogue;
}

const TIER_NAMES = ["", "Bronze", "Silver", "Gold"];

function featuredBadges(user: UnisonUser, badges: Map<string, CatalogueBadge>): NonNullable<Profile["badges"]> {
  return (user.featured ?? []).flatMap((featured) => {
    if (!featured.key) return [];
    const info = badges.get(featured.key);
    const tier = featured.tier ? info?.tiers?.find((t) => t.level === featured.tier) : undefined;
    const icon = tier?.image?.color ?? info?.image?.color ?? `/badges/${encodeURIComponent(featured.key)}/image.svg?variant=color`;
    const name = info?.name ?? featured.name ?? featured.key;
    const tierName = featured.tier ? TIER_NAMES[featured.tier] ?? `Tier ${featured.tier}` : undefined;
    return [{
      key: featured.key,
      name: tierName ? `${name} · ${tierName}` : name,
      description: info?.description,
      iconUrl: icon.startsWith("http") ? icon : `${UNISON_ORIGIN}${icon}`,
    }];
  });
}

type UnisonSubmission = {
  id?: number;
  videoId?: string;
  song?: string;
  artist?: string;
  album?: string;
  hidden?: boolean;
};

const cache = new Map<string, { profile: Profile; expires: number }>();

async function getData<T>(path: string, signal: AbortSignal): Promise<T | null> {
  const res = await fetch(`${UNISON_ORIGIN}${path}`, { signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { success?: boolean; data?: T };
  return body?.success ? (body.data ?? null) : null;
}

const formatCount = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : undefined;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export async function fetchUnisonProfile(keyId: string, signal: AbortSignal): Promise<Profile | null> {
  const cached = cache.get(keyId);
  if (cached && cached.expires > Date.now()) return cached.profile;

  const id = encodeURIComponent(keyId);
  const [user, submissions, badgeCatalogue] = await Promise.all([
    getData<UnisonUser>(`/leaderboard/users/${id}`, signal),
    getData<{ submissions?: UnisonSubmission[] }>(`/users/${id}/submissions?limit=${TRACK_LIMIT}`, signal).catch(() => null),
    getCatalogue(signal),
  ]);
  if (!user?.displayName && !user?.handle) return null;

  const tracks: ProfileTrack[] = (submissions?.submissions ?? [])
    .filter((entry) => entry.videoId && !entry.hidden)
    .map((entry) => ({
      id: String(entry.id ?? entry.videoId),
      url: `${UNISON_ORIGIN}/song/${encodeURIComponent(entry.videoId!)}`,
      title: entry.song,
      artist: entry.artist,
      album: entry.album,
      coverUrl: `${UNISON_ORIGIN}/artwork/image?v=${encodeURIComponent(entry.videoId!)}`,
    }));

  const figures: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string | undefined) => {
    if (value) figures.push({ label, value });
  };
  push("Submissions", formatCount(user.submissionCount));
  push("Upvotes", formatCount(user.totalUpvotes));
  push("Rank", user.ranked && user.rank ? `#${user.rank}` : undefined);
  push("Level", formatCount(user.level));

  const username = user.handle || user.displayName!;
  const profile: Profile = {
    username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.banner?.artworkUrl,
    // The badges show beside the handle, so the tag is the contributor tier.
    tag: user.tier ? capitalize(user.tier) : undefined,
    badges: featuredBadges(user, badgeCatalogue),
    links: [],
    views: {},
    counts: {},
    figures,
    trackCount: Math.max(user.submissionCount ?? 0, tracks.length),
    tracks,
    tracksTitle: "Latest submissions",
    siteName: "Unison",
    profileUrl: user.handle
      ? `${UNISON_ORIGIN}/u/${encodeURIComponent(user.handle)}`
      : unisonProfileUrl(keyId),
  };
  cache.set(keyId, { profile, expires: Date.now() + CACHE_MS });
  return profile;
}
