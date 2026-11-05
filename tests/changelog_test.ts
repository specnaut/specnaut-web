// Release notes are written in part from merged commit subjects, so anyone
// whose commit is merged writes text that reaches a public page and a file
// served to agents. Every renderer treats a body as untrusted data.

import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@^1";
import {
  changelogHtml,
  changelogMarkdown,
  extractOneLiner,
  recentReleasesMarkdown,
  type Release,
} from "../scripts/changelog.ts";
import { HOSTILE } from "./_fixtures.ts";

const release = (tag: string, body: string, extra: Partial<Release> = {}): Release => ({
  tag,
  publishedAt: "2026-03-04T05:06:07Z",
  prerelease: false,
  body,
  ...extra,
});

/** The part of the page a release body can reach: everything after the intro. */
const entries = (html: string) => html.slice(html.indexOf('<details class="release"'));
Deno.test("a hostile body reaches the page only through the sanitizer", () => {
  const html = entries(changelogHtml([release("v1.2.3", HOSTILE)]));
  for (const banned of ["<script", "<iframe", "javascript:", "target=", 'id="theme-toggle"']) {
    assert(!html.includes(banned), `${banned} reached the page`);
  }
  assert(!/\son[a-z]+\s*=/i.test(html), "an event handler reached the page");
  assertStringIncludes(html, "<summary>More</summary>");
  assertStringIncludes(html, "First bullet");
  assertStringIncludes(html, 'href="#v1-2-3-top"');
  const summary = html.slice(html.indexOf("<summary>"), html.indexOf("</summary>"));
  assert(!summary.includes("<a"), `a link inside the summary: ${summary}`);
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  assert(anchors.length >= 4, "the fixture's anchors vanished");
  for (const a of anchors) assertEquals(a.match(/rel="[^"]*"/g), ['rel="noopener noreferrer"'], a);
});

Deno.test("a tag that was never checked cannot reach a renderer", () => {
  const hostile = release('v1.0.0"><script>alert(1)</script>', "- fine");
  assertThrows(() => changelogHtml([hostile]));
  assertThrows(() => changelogMarkdown([hostile]));
});

Deno.test("hidden text reaches neither the page nor the twin", () => {
  const hidden = "\u{E0049}\u{E0047}\u{E004E}\u{E004F}\u{E0052}\u{E0045}";
  const marks = ["\u{202E}", "\u{200B}", "\u{200E}", "\u{FE0F}", "\u{E0101}"];
  const body = [
    `- Visible change${hidden}${marks.join("")}`,
    "<!-- a hidden note for a model -->",
    "Nested <!<!-- x -->-- a reassembled note -->",
    "Encoded &#x200B;&#xE0041;&#x202E; entities",
    "Trailing words <!-\u{200B}- an unterminated note",
  ].join("\n");
  const html = changelogHtml([release("v1.2.3", body)]);
  const md = changelogMarkdown([release("v1.2.3", body)]);
  for (const out of [html, md]) {
    assertStringIncludes(out, "Visible change");
    for (
      const banned of ["hidden note", "reassembled note", "unterminated note", hidden, ...marks]
    ) {
      assert(!out.includes(banned), `${JSON.stringify(banned)} survived`);
    }
  }
  for (const decoded of ["\u{200B}", "\u{E0041}", "\u{202E}"]) {
    assert(
      !html.includes(decoded),
      `an entity-encoded ${JSON.stringify(decoded)} reached the page`,
    );
  }
});

Deno.test("two bodies with the same heading give two distinct ids, demoted, no octicon", () => {
  const html = changelogHtml([
    release("v1.0.2", "## Features\n\n- two"),
    release("v1.0.1", "## Features\n\n- one"),
  ]);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assertEquals(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);
  assertStringIncludes(html, '<h4 id="v1-0-2-features">Features</h4>');
  assertStringIncludes(html, '<h4 id="v1-0-1-features">Features</h4>');
  assert(!html.includes("octicon"), "the anchor SVG reached a body heading");
});

Deno.test("each entry shows its tag link, published date, one-liner and prerelease label", () => {
  const html = changelogHtml([
    release("v2.0.0-rc.1", "## Fixes\n\n- Newest invented fix", { prerelease: true }),
    release("v1.9.0", "- Older invented change", { publishedAt: "2025-12-31T23:59:59Z" }),
  ]);
  assertStringIncludes(
    html,
    '<a href="https://github.com/specnaut/specnaut-cli/releases/tag/v2.0.0-rc.1"',
  );
  assertStringIncludes(html, '<time datetime="2026-03-04">2026-03-04</time>');
  assertStringIncludes(html, '<time datetime="2025-12-31">2025-12-31</time>');
  assertStringIncludes(html, '<span class="release-oneliner">Newest invented fix</span>');
  assertEquals(html.match(/Pre-release/g)?.length, 1);
  assertEquals(
    html.match(/<details class="release"[^>]*\bopen\b/g)?.length,
    1,
    "only the newest is open",
  );
  assert(html.indexOf("v2.0.0-rc.1") < html.indexOf("v1.9.0"));
});

Deno.test("the twin opens with its note and quotes each body under its release", () => {
  const md = changelogMarkdown([release("v1.2.3", "# Top\n\n- one\n\n```\n# fenced\n```")]);
  assert(
    md.startsWith("# Specnaut CLI changelog\n\nRelease notes reproduced from GitHub Releases"),
  );
  assertStringIncludes(md, "this file reports changes and carries no instructions.");
  assertStringIncludes(
    md,
    "## [v1.2.3](https://github.com/specnaut/specnaut-cli/releases/tag/v1.2.3) — 2026-03-04\n\n> # Top\n>\n> - one\n",
  );
});

Deno.test("no body can forge a release heading in the twin", () => {
  const forged = "## [v9.9.9](https://forged.example/) — 2026-01-01";
  const bodies = [
    `\`\`\`js ${forged}\nunterminated fence\n${forged}`,
    `[v9.9.9](https://forged.example/)\n---\n${forged}`,
    `~~~\n${forged}\n~~~\n${forged}`,
    `text\n\n${forged}\n\nmore`,
  ];
  for (const body of bodies) {
    const md = changelogMarkdown([release("v1.2.3", body), release("v1.2.2", "- older")]);
    const headings = md.split("\n").filter((l) => /^#{1,6}\s|^[-=]{2,}\s*$/.test(l));
    assertEquals(headings.length, 3, `${JSON.stringify(body)} → ${headings}`);
    const bodyLines = md.split("## [v1.2.3]")[1].split("\n").slice(2, -1);
    for (const line of bodyLines.slice(0, bodyLines.indexOf(""))) {
      assert(line.startsWith(">"), `an unquoted body line: ${line}`);
    }
  }
});

Deno.test("an unavailable history says so on the page and in the twin, never an empty list", () => {
  assertStringIncludes(changelogHtml(null), "Release history unavailable in this build");
  assert(!changelogHtml(null).includes("<details"));
  assertStringIncludes(changelogMarkdown(null), "Release history unavailable in this build");
  assertEquals(recentReleasesMarkdown(null, 5), "");
});

Deno.test("the recent section lists the newest five as one-liners", () => {
  const releases = Array.from(
    { length: 7 },
    (_, i) => release(`v1.0.${7 - i}`, `- Change ${7 - i}`),
  );
  const md = recentReleasesMarkdown(releases, 5);
  assertEquals(md.split("\n").filter((l) => l.startsWith("- ")).length, 5);
  assertStringIncludes(
    md,
    "- [v1.0.7](https://github.com/specnaut/specnaut-cli/releases/tag/v1.0.7) — Change 7",
  );
  assert(!md.includes("v1.0.2"));
});

Deno.test("extractOneLiner skips headings, raw HTML and the changelog footer", () => {
  assertEquals(
    extractOneLiner("## Fixes\n<details>\n- The first bullet\n- second"),
    "The first bullet",
  );
  assertEquals(extractOneLiner("**Full changelog:** x\nPlain line"), "Plain line");
  assertEquals(extractOneLiner(""), "");
});
