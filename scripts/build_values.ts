/**
 * The values a build writes into its hand-written sources.
 *
 * `docs/llms.md`, `docs/SKILL.md` and the static landing carry
 * `__SPECNAUT_…__` placeholders where a value changes with the build (the
 * release, the Cloud origin) or must be spelled once for every page (the
 * install command). Each value is defined here once; `buildValues` maps every
 * placeholder to it, and every source goes through the same map.
 */

/**
 * The release the site is built for. The OpenCode install line pins the
 * plugin to a release tag (cli#667) and SKILL.md is stamped with it; a tag
 * written by hand would lag the first release after it. The site rebuilds on
 * every CLI release and daily, so the placeholder keeps both on the latest
 * release without anyone editing this repo.
 */
const VERSION_PLACEHOLDER = "__SPECNAUT_VERSION__";

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

/**
 * The canonical installer: the only URL any page, or any agent following
 * SKILL.md, fetches `install.sh` from. The script verifies the release
 * binary's SHA-256 before installing it, so a second spelling of this URL is
 * a second trust root nobody audits — every install line derives from it.
 */
const INSTALLER_URL = "https://raw.githubusercontent.com/specnaut/specnaut-cli/main/install.sh";

/** The install line every page shows: the landing (twice), llms.txt and SKILL.md. */
export const INSTALL_COMMAND = `curl -fsSL ${INSTALLER_URL} | bash`;

/** The documented variants, built from the same base: `install.sh` reads both from its env. */
export function installVariants(version: string): { pinned: string; prefix: string } {
  return {
    pinned: `curl -fsSL ${INSTALLER_URL} | VERSION=v${version} bash`,
    prefix: `curl -fsSL ${INSTALLER_URL} | PREFIX=$HOME/.local/bin bash`,
  };
}

/** Where the install skill is published, under the output directory. A public path: never move it. */
export const SKILL_PATH = "SKILL.md";

/**
 * The one line the landing's "Copy prompt" puts on the clipboard. The URL is
 * written with its scheme so no agent fetches the skill over plain HTTP.
 */
const AGENT_PROMPT = `Set up Specnaut in this repository: ${SITE_URL}/${SKILL_PATH}`;

/** Every placeholder a source may carry, with this build's value. */
export function buildValues(version: string, appUrl: string): Record<string, string> {
  const { pinned, prefix } = installVariants(version);
  return {
    [VERSION_PLACEHOLDER]: version,
    [APP_URL_PLACEHOLDER]: appUrl,
    [APP_HOST_PLACEHOLDER]: new URL(appUrl).host,
    __SPECNAUT_INSTALL_COMMAND__: INSTALL_COMMAND,
    __SPECNAUT_INSTALL_PINNED__: pinned,
    __SPECNAUT_INSTALL_PREFIX__: prefix,
    __SPECNAUT_AGENT_PROMPT__: AGENT_PROMPT,
  };
}

/** `text` with every key of `values` replaced by its value. */
export function substitute(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [placeholder, value] of Object.entries(values)) {
    out = out.replaceAll(placeholder, value);
  }
  return out;
}
