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
  recentReleasesMarkdown,
  type Release,
} from "./changelog.ts";
import { pageHtml } from "./page_template.ts";
import { fetchReleases, REPO_URL, resolveVersion } from "./releases.ts";

const SOURCE = "docs/llms.md";
const SITE_DIR = "docs/site";
const OUT_DIR = "docs-dist";
const VERSION_PLACEHOLDER = "__SPECNAUT_VERSION__";

/**
 * Cloud app origin for the site's "Cloud →" / "Start free" / sign-in links.
 * Single source of truth — defaults to production and is overridden at build
 * time via the `SPECNAUT_APP_URL` env var. The local docker stack sets it to
 * `http://app.specnaut.localhost` so the sign-in funnel can be exercised end to
 * end locally; production builds leave it unset → output identical to before.
 *
 * `__SPECNAUT_APP_URL__` (full origin, link `href`) and `__SPECNAUT_APP_HOST__`
 * (host only, visible label) are substituted in the static landing's HTML by
 * `copyLandingSite`, mirroring the `__SPECNAUT_VERSION__` mechanism.
 */
const DEFAULT_APP_URL = "https://app.specnaut.com";
const APP_URL_PLACEHOLDER = "__SPECNAUT_APP_URL__";
const APP_HOST_PLACEHOLDER = "__SPECNAUT_APP_HOST__";

/** Resolve the Cloud app origin for this build (env override → prod default). */
export function resolveAppUrl(): string {
  return Deno.env.get("SPECNAUT_APP_URL") ?? DEFAULT_APP_URL;
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

/**
 * GitHub Pages custom domain. Emitted as `docs-dist/CNAME` so each deploy
 * republishes it; without this, GitHub Pages drops the custom domain on
 * subsequent workflow deploys (build_type=workflow ignores the repo
 * settings UI alone — the artifact's CNAME file is the source of truth).
 *
 * The CNAME on OVH (`specnaut → specnaut.github.io.`) routes traffic here.
 */
const CUSTOM_DOMAIN = "specnaut.com";

const SITE_URL = `https://${CUSTOM_DOMAIN}`;

const DOCS_DESCRIPTION =
  "Specnaut — enhanced spec-kit CLI with auto-chained workflow, review phase, and backlog. Distributed as a single native binary.";
const CHANGELOG_DESCRIPTION =
  "Every published release of the Specnaut CLI, newest first, with its full release notes.";

/** Always in llms.txt: the full history is linked, never inlined (it would crowd out the docs). */
const TWIN_LINK = `Full release history: [/changelog.md](${SITE_URL}/changelog.md)`;

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
 * Every generated file, keyed by its path under the output directory. Pure:
 * the docs page, `llms.txt`, the Changelog and its twin all derive from the
 * one `releases` list (`null` when a local build could not fetch it).
 */
export function renderSite(inputs: SiteInputs, releases: Release[] | null): Record<string, string> {
  const { version, appUrl } = inputs;
  const recent = recentReleasesMarkdown(releases, 5);
  const enriched = [inputs.markdown, recent, TWIN_LINK].filter(Boolean).join("\n\n") + "\n";
  const docsBody = render(enriched, { allowIframes: false });
  return {
    "docs/index.html": pageHtml({
      current: "docs",
      title: "Specnaut — documentation",
      description: DOCS_DESCRIPTION,
      canonical: `${SITE_URL}/docs/`,
      twin: "/llms.txt",
      body: `<article class="markdown-body">\n${docsBody}\n</article>`,
      version,
      appUrl,
    }),
    "llms.txt": `<!-- Specnaut v${version} — ${REPO_URL} -->\n\n${enriched}`,
    "changelog/index.html": pageHtml({
      current: "changelog",
      title: "Specnaut — changelog",
      description: CHANGELOG_DESCRIPTION,
      canonical: `${SITE_URL}/changelog/`,
      twin: "/changelog.md",
      body: changelogHtml(releases),
      version,
      appUrl,
    }),
    "changelog.md": changelogMarkdown(releases),
    "CNAME": `${CUSTOM_DOMAIN}\n`,
    // Consumed by the `specnaut-guide` agent to compare the user's installed
    // version against the latest released one. `released_at` is the build date.
    "version.json": JSON.stringify({ version, released_at: inputs.today }, null, 2) + "\n",
  };
}

/** Writes `renderSite`'s files under `outDir`, creating their directories. */
export async function writeSite(outDir: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const dest = `${outDir}/${path}`;
    await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(dest, content);
  }
}

/**
 * Recursively walk `siteDir` and mirror every file into `outDir`, preserving
 * sub-directory structure. HTML files have `__SPECNAUT_VERSION__` substituted
 * so the static landing can show the current release version without a build
 * step of its own.
 *
 * Silently no-ops when `siteDir` does not exist — keeps tests with synthetic
 * temp dirs hermetic while production builds always have `docs/site/` on disk.
 */
export async function copyLandingSite(
  siteDir: string,
  outDir: string,
  version: string,
  appUrl: string,
): Promise<string[]> {
  const appHost = new URL(appUrl).host;
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(siteDir);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    throw err;
  }
  if (!stat.isDirectory) return [];

  const written: string[] = [];

  async function walk(current: string, relative: string): Promise<void> {
    for await (const entry of Deno.readDir(current)) {
      const src = `${current}/${entry.name}`;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const dest = `${outDir}/${rel}`;
      if (entry.isDirectory) {
        await Deno.mkdir(dest, { recursive: true });
        await walk(src, rel);
        continue;
      }
      if (entry.isFile) {
        if (entry.name.endsWith(".html")) {
          const raw = await Deno.readTextFile(src);
          await Deno.writeTextFile(
            dest,
            raw
              .replaceAll(VERSION_PLACEHOLDER, version)
              .replaceAll(APP_URL_PLACEHOLDER, appUrl)
              .replaceAll(APP_HOST_PLACEHOLDER, appHost),
          );
        } else {
          await Deno.copyFile(src, dest);
        }
        written.push(dest);
      }
    }
  }

  await Deno.mkdir(outDir, { recursive: true });
  await walk(siteDir, "");
  return written;
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
  const siteFiles = await copyLandingSite(opts.siteDir ?? SITE_DIR, outDir, version, appUrl);
  return { files, version, siteFiles };
}

if (import.meta.main) {
  const { files, version, siteFiles } = await buildDocs();
  for (const [path, content] of Object.entries(files)) {
    console.log(`✓ wrote ${OUT_DIR}/${path} (${content.length} bytes)`);
  }
  console.log(`✓ copied ${siteFiles.length} landing files from ${SITE_DIR}/ (v${version})`);
}
