/**
 * The values a build writes into its hand-written sources.
 *
 * `docs/llms.md` and the static landing carry `__SPECNAUT_…__` placeholders
 * where a value changes with the build (the release, the Cloud origin). Each
 * value is defined here once; `buildValues` maps every placeholder to it, and
 * every source goes through the same map.
 */

export const VERSION_PLACEHOLDER = "__SPECNAUT_VERSION__";

/**
 * GitHub Pages custom domain. Emitted as `docs-dist/CNAME` so each deploy
 * republishes it; without this, GitHub Pages drops the custom domain on
 * subsequent workflow deploys (build_type=workflow ignores the repo
 * settings UI alone — the artifact's CNAME file is the source of truth).
 *
 * The CNAME on OVH (`specnaut → specnaut.github.io.`) routes traffic here.
 */
export const CUSTOM_DOMAIN = "specnaut.com";

export const SITE_URL = `https://${CUSTOM_DOMAIN}`;

/**
 * Cloud app origin for the site's "Cloud →" / "Start free" / sign-in links.
 * Single source of truth — defaults to production and is overridden at build
 * time via the `SPECNAUT_APP_URL` env var. The local docker stack sets it to
 * `http://app.specnaut.localhost` so the sign-in funnel can be exercised end to
 * end locally; production builds leave it unset → output identical to before.
 *
 * `__SPECNAUT_APP_URL__` (full origin, link `href`) and `__SPECNAUT_APP_HOST__`
 * (host only, visible label) are substituted in the static landing's HTML.
 */
const DEFAULT_APP_URL = "https://app.specnaut.com";
const APP_URL_PLACEHOLDER = "__SPECNAUT_APP_URL__";
const APP_HOST_PLACEHOLDER = "__SPECNAUT_APP_HOST__";

/** Resolve the Cloud app origin for this build (env override → prod default). */
export function resolveAppUrl(): string {
  return Deno.env.get("SPECNAUT_APP_URL") ?? DEFAULT_APP_URL;
}

/** Every placeholder the landing's HTML may carry, with this build's value. */
export function buildValues(version: string, appUrl: string): Record<string, string> {
  return {
    [VERSION_PLACEHOLDER]: version,
    [APP_URL_PLACEHOLDER]: appUrl,
    [APP_HOST_PLACEHOLDER]: new URL(appUrl).host,
  };
}

/**
 * The docs source with every `__SPECNAUT_VERSION__` replaced by the release.
 *
 * The OpenCode install line pins the plugin to a release tag (cli#667), and a
 * tag written by hand here would lag the first release after it. The site
 * rebuilds on every CLI release and daily, so the placeholder keeps the
 * published line on the latest release without anyone editing this repo.
 */
export function withVersion(markdown: string, version: string): string {
  return markdown.replaceAll(VERSION_PLACEHOLDER, version);
}

/** `text` with every key of `values` replaced by its value. */
export function substitute(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [placeholder, value] of Object.entries(values)) {
    out = out.replaceAll(placeholder, value);
  }
  return out;
}
