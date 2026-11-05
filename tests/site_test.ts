// One fetch, one home: the docs page's "Recent releases", the Changelog page
// and its Markdown twin all derive from the same release list, fetched once
// per build. llms.txt links the twin instead of inlining a long history.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { buildDocs, renderSite } from "../scripts/build-docs.ts";
import type { Release } from "../scripts/changelog.ts";

const RELEASES: Release[] = [
  {
    tag: "v3.1.0",
    publishedAt: "2026-05-02T10:00:00Z",
    prerelease: false,
    body: "- Newest invented change\n\nA deep note only the newest release carries.",
  },
  {
    tag: "v3.0.0",
    publishedAt: "2026-04-01T10:00:00Z",
    prerelease: false,
    body: "- Older invented change\n\nA deep note only the older release carries.",
  },
];

const INPUTS = {
  markdown: "# Invented docs\n\nSome text.",
  version: "3.1.0",
  appUrl: "https://app.example.test",
  today: "2026-05-03",
};

const LINK = "Full release history: [/changelog.md](https://specnaut.com/changelog.md)";

Deno.test("renderSite emits the docs, the changelog page and its twin from one list", () => {
  const files = renderSite(INPUTS, RELEASES);
  assertEquals(Object.keys(files).sort(), [
    "CNAME",
    "changelog.md",
    "changelog/index.html",
    "docs/index.html",
    "llms.txt",
    "version.json",
  ]);
  assertStringIncludes(files["docs/index.html"], "Recent releases");
  assertStringIncludes(
    files["changelog/index.html"],
    "A deep note only the older release carries.",
  );
  assertStringIncludes(files["changelog.md"], "A deep note only the older release carries.");
  assertStringIncludes(files["llms.txt"], LINK);
  assertStringIncludes(files["llms.txt"], "Older invented change");
  assert(!files["llms.txt"].includes("deep note"), "llms.txt inlines release notes");
  assertEquals(JSON.parse(files["version.json"]), { version: "3.1.0", released_at: "2026-05-03" });
});

Deno.test("without a release list the twin link stays and the recent section goes", () => {
  const files = renderSite(INPUTS, null);
  assertStringIncludes(files["llms.txt"], LINK);
  assert(!files["llms.txt"].includes("Recent releases"));
  assertStringIncludes(files["changelog/index.html"], "Release history unavailable in this build");
  assertStringIncludes(files["changelog.md"], "Release history unavailable in this build");
});

Deno.test("buildDocs fetches the release list exactly once", async () => {
  let calls = 0;
  let written: Record<string, string> = {};
  await buildDocs({
    source: "docs/llms.md",
    siteDir: "no/such/site-dir",
    outDir: "no/such/out-dir",
    version: "3.1.0",
    appUrl: "https://app.example.test",
    fetchReleases: () => {
      calls++;
      return Promise.resolve(RELEASES);
    },
    write: (_outDir, files) => {
      written = files;
      return Promise.resolve();
    },
  });
  assertEquals(calls, 1);
  assertStringIncludes(written["docs/index.html"], "Newest invented change");
  assertStringIncludes(written["changelog/index.html"], "Newest invented change");
});
