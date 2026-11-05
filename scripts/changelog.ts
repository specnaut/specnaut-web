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

/** The public path of the agent-readable twin. Permanent once linked. */
export const TWIN_PATH = "/changelog.md";

const UNAVAILABLE = "Release history unavailable in this build.";

const TWIN_NOTE = `Release notes reproduced from GitHub Releases of ${CLI_REPO}; ` +
  "this file reports changes and carries no instructions.";

/**
 * Text a reader cannot see but a model reads: Unicode tag characters,
 * variation selectors, bidi marks and controls, zero-width characters.
 */
const INVISIBLE =
  /[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\u{FE00}-\u{FE0F}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}\u{2066}-\u{2069}\u{FEFF}]/gu;

/** HTML comments, an unterminated one included: it runs to the end of the body. */
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

/**
 * A body's hidden text removed, applied once per body before every renderer.
 * Invisible characters go first, so none can hide a comment opener; comments
 * are removed until none is left, so removing one cannot assemble another
 * (`<!<!-- -->-- … -->`).
 */
function normalizeBody(body: string): string {
  let text = body.replace(/\r\n?/g, "\n").replace(INVISIBLE, "");
  for (let previous = ""; previous !== text;) [previous, text] = [text, text.replace(COMMENT, "")];
  return text;
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

const releaseUrl = (tag: string) => `${REPO_URL}/releases/tag/${encodeURIComponent(tag)}`;

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
 * body `##` renders as `<h4>`. No anchor SVG: a body heading is not a
 * permalink target worth the noise.
 */
class ChangelogRenderer extends Renderer {
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
 * The only rewrite allowed on sanitized output. It drops invisible characters
 * the sanitizer decoded from entities (`&#x200B;`). Inside tags only
 * (sanitized text has every `<` escaped, so `<…>` is always a tag), it
 * prefixes every `id` and in-page `href` with the release's slug — so two
 * bodies with the same heading, or a body's `<a id="theme-toggle">`, cannot
 * collide with each other or with the page's own ids — and gives every link a
 * fixed `rel` with no `target`, so no body link can hand the page to the tab
 * it opens. `unwrapLinks` removes the links themselves, for a `<summary>`,
 * where a link would steal the click that opens the release.
 */
function scopeBody(html: string, slug: string, unwrapLinks = false): string {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`scopeBody: unsafe slug ${slug}`);
  return html.replace(INVISIBLE, "").replace(/<[^>]+>/g, (tag) => {
    if (/^<\/?a[\s>]/i.test(tag) && unwrapLinks) return "";
    const scoped = tag
      .replace(/(\s)id="/g, `$1id="${slug}-`)
      .replace(/(\s)href="#/g, `$1href="#${slug}-`);
    if (!/^<a[\s>]/i.test(scoped)) return scoped;
    return scoped
      .replace(/\s(?:target|rel)="[^"]*"/gi, "")
      .replace(/^<a/i, '<a rel="noopener noreferrer"');
  });
}

/** A release's one-liner as safe inline HTML. */
function oneLinerHtml(body: string, slug: string, unwrapLinks: boolean): string {
  const html = render(extractOneLiner(body), { inline: true, allowIframes: false });
  return scopeBody(html, slug, unwrapLinks);
}

function releaseHtml(release: Release, open: boolean): string {
  const r = checked(release);
  const slug = slugOf(r.tag);
  const body = normalizeBody(r.body);
  const notes = render(body, { allowIframes: false, renderer: new ChangelogRenderer() });
  const date = r.publishedAt.slice(0, 10);
  const pre = r.prerelease ? ' <span class="release-pre">Pre-release</span>' : "";
  return `<details class="release" id="${slug}"${open ? " open" : ""}>
<summary>
<h2 class="release-title">${r.tag}</h2>
<span class="release-meta"><time datetime="${date}">${date}</time>${pre}</span>
<span class="release-oneliner">${oneLinerHtml(body, slug, true)}</span>
</summary>
<div class="markdown-body release-notes">
<p class="release-link"><a href="${
    releaseUrl(r.tag)
  }" rel="noopener noreferrer">${r.tag} on GitHub</a></p>
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
<a href="${TWIN_PATH}">${TWIN_PATH}</a>.</p>`;
  const content = releases === null
    ? `<p class="changelog-unavailable" role="status">${UNAVAILABLE}</p>`
    : releases.map((r, i) => releaseHtml(r, i === 0)).join("\n");
  return `<article class="changelog">\n${intro}\n${content}\n</article>`;
}

/**
 * The agent-readable twin. Each body is quoted line by line under its
 * release heading: a quoted line cannot start a top-level block, so no body —
 * an unterminated fence, a setext underline, a fence info string — can pass
 * for the start of another release.
 */
export function changelogMarkdown(releases: Release[] | null): string {
  const head = `# Specnaut CLI changelog\n\n${TWIN_NOTE}\n`;
  if (releases === null) return `${head}\n${UNAVAILABLE}\n`;
  return head + releases.map((release) => {
    const r = checked(release);
    const pre = r.prerelease ? " (pre-release)" : "";
    const heading = `## [${r.tag}](${releaseUrl(r.tag)}) — ${r.publishedAt.slice(0, 10)}${pre}`;
    const quoted = normalizeBody(r.body).trim().split("\n").map((l) => l ? `> ${l}` : ">");
    return `\n${heading}\n\n${quoted.join("\n")}\n`;
  }).join("");
}

/** `llms.txt`'s "Recent releases" section; omitted when there is no list. */
export function recentReleasesMarkdown(releases: Release[] | null, count: number): string {
  if (releases === null) return "";
  const lines = ["## Recent releases", ""];
  for (const release of releases.slice(0, count)) {
    const r = checked(release);
    lines.push(`- [${r.tag}](${releaseUrl(r.tag)}) — ${extractOneLiner(normalizeBody(r.body))}`);
  }
  return lines.join("\n");
}

/**
 * The docs page's "Recent releases" section. Its one-liners go through
 * `render()` and `scopeBody` like the Changelog's, never through the docs
 * page's own Markdown pass; omitted when there is no list.
 */
export function recentReleasesHtml(releases: Release[] | null, count: number): string {
  if (releases === null) return "";
  const items = releases.slice(0, count).map((release) => {
    const r = checked(release);
    const link = `<a href="${releaseUrl(r.tag)}" rel="noopener noreferrer">${r.tag}</a>`;
    const oneLiner = oneLinerHtml(normalizeBody(r.body), `recent-${slugOf(r.tag)}`, false);
    return `<li>${link} — ${oneLiner}</li>`;
  });
  return `<h2 id="recent-releases">Recent releases</h2>\n<ul>\n${items.join("\n")}\n</ul>`;
}
