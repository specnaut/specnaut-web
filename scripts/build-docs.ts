/**
 * Builds the GitHub Pages site:
 *
 *   docs/site/**            → docs-dist/**            (static landing, copied verbatim;
 *                                                      `__SPECNAUT_VERSION__` / `__SPECNAUT_APP_URL__` /
 *                                                      `__SPECNAUT_APP_HOST__` substituted in HTML)
 *   docs/llms.md            → docs-dist/docs/index.html  (HTML rendering, GFM + embedded CSS)
 *                           → docs-dist/llms.txt          (raw markdown copy, llmstxt.org convention)
 *
 * Wired up via `deno task docs:build`. Invoked by `.github/workflows/pages.yml`
 * on every push to main.
 *
 * The landing at `/` is the human-facing front door; the rendered llms.md
 * docs live at `/docs/`. The `/llms.txt` route serves the raw enriched
 * Markdown for LLM consumption (llmstxt.org convention) — its path must
 * NEVER move.
 */
import { render } from "@deno/gfm";
import { pageHtml } from "./page_template.ts";
import { githubHeaders, REPO_URL, resolveVersion } from "./releases.ts";

const SOURCE = "docs/llms.md";
const SITE_DIR = "docs/site";
const OUT_DIR = "docs-dist";
const OUT_HTML = `${OUT_DIR}/docs/index.html`;
const OUT_MD = `${OUT_DIR}/llms.txt`;
const OUT_CNAME = `${OUT_DIR}/CNAME`;
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
 * Fetch the last `count` GitHub releases and render a "Recent releases"
 * Markdown section. On any failure (network, non-2xx, malformed payload),
 * emit a warning to stderr and return an empty string — the docs deploy
 * MUST NOT fail because of a cosmetic section.
 *
 * Authenticated via `githubHeaders()`: the unauthenticated 60/hour ceiling is
 * per runner IP and shared with other jobs, so it is not "sufficient for the
 * build cadence" — it 403'd in practice.
 */
export async function fetchRecentReleases(count = 5): Promise<string> {
  const url = `https://api.github.com/repos/specnaut/specnaut-cli/releases?per_page=${count}`;
  let releases: Array<{ tag_name: string; body: string }>;
  try {
    const res = await fetch(url, { headers: githubHeaders() });
    if (!res.ok) {
      console.warn(
        `::warning::fetchRecentReleases: HTTP ${res.status} from ${url} — skipping section`,
      );
      return "";
    }
    releases = await res.json();
  } catch (err) {
    console.warn(
      `::warning::fetchRecentReleases: ${
        err instanceof Error ? err.message : err
      } — skipping section`,
    );
    return "";
  }
  if (!Array.isArray(releases) || releases.length === 0) return "";

  const lines: string[] = ["## Recent releases", ""];
  for (const r of releases.slice(0, count)) {
    const oneLiner = extractOneLiner(r.body ?? "");
    const tagUrl = `${REPO_URL}/releases/tag/${r.tag_name}`;
    lines.push(`- [${r.tag_name}](${tagUrl}) — ${oneLiner}`);
  }
  return lines.join("\n");
}

/**
 * Extracts a one-liner summary from a `gen-changelog.ts`-style release body.
 * Skips heading lines (`##`, `###`) and the trailing `**Full changelog:**`.
 * Returns the first bullet text, or the first non-empty non-heading line if
 * no bullet is present.
 */
export function extractOneLiner(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("**Full changelog")) continue;
    // Skip raw HTML lines (e.g. <details>/<summary> wrappers) — they render
    // as an empty, broken disclosure if surfaced as a one-liner.
    if (line.startsWith("<")) continue;
    if (line.startsWith("- ")) return line.slice(2).trim();
    return line;
  }
  return "";
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

const DOCS_DESCRIPTION =
  "Specnaut — enhanced spec-kit CLI with auto-chained workflow, review phase, and backlog. Distributed as a single native binary.";

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
  fetchReleases?: () => Promise<string>;
} = {}): Promise<
  {
    html: string;
    markdown: string;
    version: string;
    versionJson: string;
    siteFiles: string[];
  }
> {
  const source = opts.source ?? SOURCE;
  const siteDir = opts.siteDir ?? SITE_DIR;
  const outDir = opts.outDir ?? OUT_DIR;
  const version = opts.version ?? await resolveVersion();
  const appUrl = opts.appUrl ?? resolveAppUrl();
  const fetchReleases = opts.fetchReleases ?? (() => fetchRecentReleases());
  const outHtml = `${outDir}/docs/index.html`;
  const outMd = `${outDir}/llms.txt`;
  const outVersionJson = `${outDir}/version.json`;

  const sourceMarkdown = withVersion(await Deno.readTextFile(source), version);
  const releaseSection = await fetchReleases();
  const enrichedMarkdown = releaseSection
    ? `${sourceMarkdown}\n\n${releaseSection}\n`
    : sourceMarkdown;
  const rendered = render(enrichedMarkdown, { allowIframes: false });
  const html = pageHtml({
    current: "docs",
    title: "Specnaut — documentation",
    description: DOCS_DESCRIPTION,
    canonical: "https://specnaut.com/docs/",
    twin: "/llms.txt",
    body: `<article class="markdown-body">\n${rendered}\n</article>`,
    version,
    appUrl,
  });
  const markdown = `<!-- Specnaut v${version} — ${REPO_URL} -->\n\n${enrichedMarkdown}`;

  // Lightweight machine-readable endpoint consumed by the `specnaut-guide`
  // agent to compare the user's installed version against the latest
  // released one. `released_at` is the build timestamp — accurate within
  // the day since pages.yml redeploys on every docs change (and can be
  // re-run on dispatch when a new CLI release ships).
  const versionJson = JSON.stringify(
    { version, released_at: new Date().toISOString().split("T")[0] },
    null,
    2,
  ) + "\n";

  await Deno.mkdir(`${outDir}/docs`, { recursive: true });
  await Deno.writeTextFile(outHtml, html);
  await Deno.writeTextFile(outMd, markdown);
  await Deno.writeTextFile(`${outDir}/CNAME`, `${CUSTOM_DOMAIN}\n`);
  await Deno.writeTextFile(outVersionJson, versionJson);

  // Mirror the static landing on top of `outDir` last so its `index.html`
  // shadows nothing — the rendered docs HTML lives in `outDir/docs/` now.
  const siteFiles = await copyLandingSite(siteDir, outDir, version, appUrl);

  return { html, markdown, version, versionJson, siteFiles };
}

if (import.meta.main) {
  const { html, version, siteFiles } = await buildDocs();
  console.log(`✓ wrote ${OUT_HTML} (${html.length} bytes, v${version})`);
  console.log(`✓ wrote ${OUT_MD}`);
  console.log(`✓ wrote ${OUT_CNAME} (${CUSTOM_DOMAIN})`);
  console.log(`✓ wrote ${OUT_DIR}/version.json (v${version})`);
  console.log(`✓ copied ${siteFiles.length} landing files from ${SITE_DIR}/`);
}
