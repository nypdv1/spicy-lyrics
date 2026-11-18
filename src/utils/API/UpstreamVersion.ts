// Leaf module (only imports project/config) so EdgeService and Query can share it without cycles.
import { UpstreamVersion } from "../../../project/config.ts";

const UPSTREAM_VERSION_URL = "https://api.spicylyrics.org/version";
const VERSION_TIMEOUT_MS = 2500;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

let cachedUpstreamVersion: string | null = null;
let inflightRequest: Promise<string> | null = null;

/**
 * Fetches and caches the live upstream Spicy Lyrics version once per session,
 * falling back to `UpstreamVersion` if the request fails or times out.
 */
export function getUpstreamVersion(): Promise<string> {
  if (cachedUpstreamVersion) return Promise.resolve(cachedUpstreamVersion);
  if (inflightRequest) return inflightRequest;

  inflightRequest = fetch(UPSTREAM_VERSION_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
  })
    .then(async (res) => {
      if (!res.ok) return UpstreamVersion;
      const text = (await res.text()).trim();
      if (!VERSION_PATTERN.test(text)) return UpstreamVersion;
      cachedUpstreamVersion = text;
      return text;
    })
    .catch(() => UpstreamVersion)
    .finally(() => {
      inflightRequest = null;
    });

  return inflightRequest;
}
