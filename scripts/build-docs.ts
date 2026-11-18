/**
 * Builds the GitHub Pages site:
 *
 *   docs/site/**   → docs-dist/**               (static landing, copied verbatim;
 *                                                `__SPECNAUT_VERSION__` / `__SPECNAUT_APP_URL__` /
 *                                                `__SPECNAUT_APP_HOST__` substituted in HTML)
 *   docs/llms.md   → docs-dist/docs/index.html  (HTML rendering, GFM, + "Recent releases")
 *                  → docs-dist/llms.txt         (raw Markdown, llmstxt.org convention)
 *   CLI releases   → docs-dist/changelog/index.html  (every release, newest first)
 *                  → docs-dist/changelog.md     (its Markdown twin, linked from llms.txt)
 *                  → docs-dist/version.json     (the latest release, for `specnaut-guide`)
 *
 * Wired up via `deno task docs:build`. Invoked by `.github/workflows/pages.yml`
 * on every push to main, daily, and on the CLI release's dispatch.
 *
 * The landing at `/` is the human-facing front door; the rendered llms.md
 * docs live at `/docs/`. The `/llms.txt`, `/changelog/` and `/changelog.md`
 * paths are public and linked — they must NEVER move.
 */
import { render } from "@deno/gfm";
import {
  changelogHtml,
  changelogMarkdown,
  recentReleasesHtml,
  recentReleasesMarkdown,
  type Release,
  TWIN_PATH,
} from "./changelog.ts";
import {
  buildValues,
  CUSTOM_DOMAIN,
  resolveAppUrl,
  SITE_URL,
  withVersion,
} from "./build_values.ts";
import { copyLandingSite } from "./landing.ts";
import { pageHtml } from "./page_template.ts";
import { fetchReleases, REPO_URL, resolveVersion } from "./releases.ts";

const SOURCE = "docs/llms.md";
const SITE_DIR = "docs/site";
const OUT_DIR = "docs-dist";
const DOCS_DESCRIPTION =
  "Specnaut — enhanced spec-kit CLI with auto-chained workflow, review phase, and backlog. Distributed as a single native binary.";
const CHANGELOG_DESCRIPTION =
  "Every published release of the Specnaut CLI, newest first, with its full release notes.";

/** Always in llms.txt: the full history is linked, never inlined (it would crowd out the docs). */
const TWIN_LINK = `Full release history: [${TWIN_PATH}](${SITE_URL}${TWIN_PATH})`;

/** What `renderSite` needs besides the release list, resolved by `buildDocs`. */
export interface SiteInputs {
  /** The docs source, `__SPECNAUT_VERSION__` already substituted. */
  markdown: string;
  version: string;
  appUrl: string;
  /** `YYYY-MM-DD`, the build date `version.json` reports. */
  today: string;
}

/**
 * The docs page. The release section is HTML from `recentReleasesHtml`, so
 * release text never goes through the docs page's own Markdown pass.
 */
function docsPage(inputs: SiteInputs, releases: Release[] | null): string {
  const markdown = render(inputs.markdown, { allowIframes: false });
  const recent = recentReleasesHtml(releases, 5);
  const link = render(TWIN_LINK, { allowIframes: false });
  return pageHtml({
    current: "docs",
    title: "Specnaut — documentation",
    description: DOCS_DESCRIPTION,
    canonical: `${SITE_URL}/docs/`,
    twin: "/llms.txt",
    body: `<article class="markdown-body">\n${[markdown, recent, link].join("\n")}\n</article>`,
    version: inputs.version,
    appUrl: inputs.appUrl,
  });
}

function changelogPage(inputs: SiteInputs, releases: Release[] | null): string {
  return pageHtml({
    current: "changelog",
    title: "Specnaut — changelog",
    description: CHANGELOG_DESCRIPTION,
    canonical: `${SITE_URL}/changelog/`,
    twin: TWIN_PATH,
    stylesheets: ["/changelog.css"],
    body: changelogHtml(releases),
    version: inputs.version,
    appUrl: inputs.appUrl,
  });
}

/**
 * Every generated file, keyed by its path under the output directory. Pure:
 * the docs page, `llms.txt`, the Changelog and its twin all derive from the
 * one `releases` list (`null` when a local build could not fetch it).
 */
export function renderSite(inputs: SiteInputs, releases: Release[] | null): Record<string, string> {
  const recent = recentReleasesMarkdown(releases, 5);
  const llms = [inputs.markdown, recent, TWIN_LINK].filter(Boolean).join("\n\n") + "\n";
  const versionJson = { version: inputs.version, released_at: inputs.today };
  return {
    "docs/index.html": docsPage(inputs, releases),
    "llms.txt": `<!-- Specnaut v${inputs.version} — ${REPO_URL} -->\n\n${llms}`,
    "changelog/index.html": changelogPage(inputs, releases),
    [TWIN_PATH.slice(1)]: changelogMarkdown(releases),
    "CNAME": `${CUSTOM_DOMAIN}\n`,
    // Consumed by the `specnaut-guide` agent to compare the user's installed
    // version against the latest released one. `released_at` is the build date.
    "version.json": JSON.stringify(versionJson, null, 2) + "\n",
  };
}

/** Writes `renderSite`'s files under `outDir`, creating their directories. */
async function writeSite(outDir: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const dest = `${outDir}/${path}`;
    await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(dest, content);
  }
}

export async function buildDocs(opts: {
  source?: string;
  siteDir?: string;
  outDir?: string;
  version?: string;
  appUrl?: string;
  fetchReleases?: () => Promise<Release[] | null>;
  write?: (outDir: string, files: Record<string, string>) => Promise<void>;
} = {}): Promise<{ files: Record<string, string>; version: string; siteFiles: string[] }> {
  const outDir = opts.outDir ?? OUT_DIR;
  const version = opts.version ?? await resolveVersion();
  const appUrl = opts.appUrl ?? resolveAppUrl();
  const markdown = withVersion(await Deno.readTextFile(opts.source ?? SOURCE), version);
  const releases = await (opts.fetchReleases ?? fetchReleases)();
  const today = new Date().toISOString().slice(0, 10);
  const files = renderSite({ markdown, version, appUrl, today }, releases);
  await (opts.write ?? writeSite)(outDir, files);
  // Mirror the static landing last: its `index.html` is the site root, and no
  // generated file lives there.
  const values = buildValues(version, appUrl);
  const siteFiles = await copyLandingSite(opts.siteDir ?? SITE_DIR, outDir, values);
  return { files, version, siteFiles };
}

if (import.meta.main) {
  const { files, version, siteFiles } = await buildDocs();
  for (const [path, content] of Object.entries(files)) {
    console.log(`✓ wrote ${OUT_DIR}/${path} (${content.length} bytes)`);
  }
  console.log(`✓ copied ${siteFiles.length} landing files from ${SITE_DIR}/ (v${version})`);
}
