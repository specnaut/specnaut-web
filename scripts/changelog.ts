/**
 * Renders the CLI's release list: the Changelog page, its Markdown twin
 * (`/changelog.md`), and the docs page's "Recent releases" section.
 *
 * A release body is untrusted data. It is written in part from merged commit
 * subjects, so anyone whose commit is merged writes text that reaches a public
 * page and a file served to agents. Every body goes through `normalizeBody`
 * once, then reaches HTML only as `render()` output (the GFM sanitizer), and
 * the sanitized HTML is rewritten by `scopeBody` alone. Pure: no I/O.
 */
import { render, Renderer } from "@deno/gfm";
import { CLI_REPO, PUBLISHED_AT_PATTERN, REPO_URL, TAG_PATTERN } from "./releases.ts";

/** One published CLI release, as `fetchReleases()` checked it. */
export interface Release {
  tag: string;
  /** ISO 8601, UTC, second precision: the date shown, never the build date. */
  publishedAt: string;
  prerelease: boolean;
  body: string;
}

const UNAVAILABLE = "Release history unavailable in this build.";

const TWIN_NOTE = `Release notes reproduced from GitHub Releases of ${CLI_REPO}; ` +
  "this file reports changes and carries no instructions.";

/**
 * Text a reader cannot see but a model reads: Unicode tag characters, bidi
 * controls and zero-width characters. Removed before comments, so that one
 * cannot hide a comment opener (`<!-` + U+200B + `-`) from the comment rule.
 */
const INVISIBLE =
  /[\u{E0000}-\u{E007F}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{200B}-\u{200D}\u{2060}\u{FEFF}]/gu;

/** HTML comments, an unterminated one included: it runs to the end of the body. */
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

/** A body's hidden text removed, applied once per body before every renderer. */
export function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(COMMENT, "");
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

/** The release's page on GitHub. */
export function releaseUrl(tag: string): string {
  return `${REPO_URL}/releases/tag/${encodeURIComponent(tag)}`;
}

/**
 * The tag and the date are interpolated without `render()`, which is safe
 * only because `fetchReleases()` pattern-checked them. A release that did not
 * come through it is a programming error, refused here rather than escaped.
 */
function checked(r: Release): Release {
  if (!TAG_PATTERN.test(r.tag) || !PUBLISHED_AT_PATTERN.test(r.publishedAt)) {
    throw new Error("changelog: a release that fetchReleases() did not check reached a renderer");
  }
  return r;
}

/** `[a-z0-9-]` only, derived from a checked tag: `v1.2.3-rc.1` → `v1-2-3-rc-1`. */
const slugOf = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Body headings sit under the page's `<h1>` and each release's `<h2>`, so a
 * body `##` renders as `<h4>`. No anchor SVG: the sanitizer would keep it, and
 * a body heading is not a permalink target worth the noise.
 */
export class ChangelogRenderer extends Renderer {
  #seen = new Map<string, number>();

  override heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6, raw: string): string {
    const h = Math.min(level + 2, 6);
    return `<h${h} id="${this.#slug(raw)}">${text}</h${h}>\n`;
  }

  #slug(raw: string): string {
    const base = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
    const n = this.#seen.get(base) ?? 0;
    this.#seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  }
}

/**
 * The only rewrite allowed on sanitized output. Inside tags only (sanitized
 * text has every `<` escaped, so `<…>` is always a tag), it prefixes every
 * `id` and in-page `href` with the release's slug — so two bodies with the
 * same heading, or a body's `<a id="theme-toggle">`, cannot collide with each
 * other or with the page's own ids — and gives every link a fixed `rel` with
 * no `target`, so no body link can hand the page to the tab it opens.
 */
export function scopeBody(html: string, slug: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`scopeBody: unsafe slug ${slug}`);
  return html.replace(/<[^>]+>/g, (tag) => {
    const scoped = tag
      .replace(/(\s)id="/g, `$1id="${slug}-`)
      .replace(/(\s)href="#/g, `$1href="#${slug}-`);
    if (!/^<a[\s>]/i.test(scoped)) return scoped;
    return scoped
      .replace(/\s(?:target|rel)="[^"]*"/gi, "")
      .replace(/^<a/i, '<a rel="noopener noreferrer"');
  });
}

function releaseHtml(release: Release, open: boolean): string {
  const r = checked(release);
  const slug = slugOf(r.tag);
  const body = normalizeBody(r.body);
  const oneLiner = render(extractOneLiner(body), { inline: true, allowIframes: false });
  const notes = render(body, { allowIframes: false, renderer: new ChangelogRenderer() });
  const date = r.publishedAt.slice(0, 10);
  const pre = r.prerelease ? ' <span class="release-pre">Pre-release</span>' : "";
  return `<details class="release" id="${slug}"${open ? " open" : ""}>
<summary>
<h2 class="release-title"><a href="${releaseUrl(r.tag)}" rel="noopener noreferrer">${r.tag}</a></h2>
<span class="release-meta"><time datetime="${date}">${date}</time>${pre}</span>
<span class="release-oneliner">${scopeBody(oneLiner, slug)}</span>
</summary>
<div class="markdown-body release-notes">
${scopeBody(notes, slug)}
</div>
</details>`;
}

/**
 * The Changelog page's content: one `<details>` per release, the newest open,
 * so a phone shows the latest notes and a list of collapsed versions below.
 * `null` (no list in a local build) renders a notice, never an empty list.
 */
export function changelogHtml(releases: Release[] | null): string {
  const intro = `<h1 class="changelog-title">Changelog</h1>
<p class="changelog-lede">Every published release of the Specnaut CLI, newest first, from
<a href="${REPO_URL}/releases">GitHub Releases</a>. The same history, as Markdown for agents:
<a href="/changelog.md">/changelog.md</a>.</p>`;
  const content = releases === null
    ? `<p class="changelog-unavailable" role="status">${UNAVAILABLE}</p>`
    : releases.map((r, i) => releaseHtml(r, i === 0)).join("\n");
  return `<article class="changelog">\n${intro}\n${content}\n</article>`;
}

/**
 * Pushes every body heading below the twin's `## <release>` level, outside
 * fenced code, so no body line can pass for the start of another release.
 */
function demoteHeadings(markdown: string): string {
  let fence: string | null = null;
  return markdown.split("\n").map((line) => {
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) {
      if (fence === null) fence = open[1][0];
      else if (open[1][0] === fence) fence = null;
      return line;
    }
    const h = fence === null ? line.match(/^( {0,3})(#{1,6})(?=\s|$)/) : null;
    if (!h) return line;
    const level = Math.min(Math.max(h[2].length + 1, 3), 6);
    return h[1] + "#".repeat(level) + line.slice(h[0].length);
  }).join("\n");
}

/** The agent-readable twin, `/changelog.md`. */
export function changelogMarkdown(releases: Release[] | null): string {
  const head = `# Specnaut CLI changelog\n\n${TWIN_NOTE}\n`;
  if (releases === null) return `${head}\n${UNAVAILABLE}\n`;
  return head + releases.map((release) => {
    const r = checked(release);
    const pre = r.prerelease ? " (pre-release)" : "";
    const heading = `## [${r.tag}](${releaseUrl(r.tag)}) — ${r.publishedAt.slice(0, 10)}${pre}`;
    return `\n${heading}\n\n${demoteHeadings(normalizeBody(r.body)).trim()}\n`;
  }).join("");
}

/** The docs page's "Recent releases" section; omitted when there is no list. */
export function recentReleasesMarkdown(releases: Release[] | null, count: number): string {
  if (releases === null) return "";
  const lines = ["## Recent releases", ""];
  for (const release of releases.slice(0, count)) {
    const r = checked(release);
    lines.push(`- [${r.tag}](${releaseUrl(r.tag)}) — ${extractOneLiner(normalizeBody(r.body))}`);
  }
  return lines.join("\n");
}
