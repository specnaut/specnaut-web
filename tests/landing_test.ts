// copyLandingSite is how the hand-written landing reaches specnaut.com: the
// only step that fills its placeholders (the release, the Cloud origin, the
// install command, the agent prompt). These tests read its real output
// through a capture sink, on the real docs/site/.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { buildValues, INSTALL_COMMAND } from "../scripts/build_values.ts";
import { copyLandingSite } from "../scripts/landing.ts";
import { captureSink } from "./_capture_sink.ts";

const VALUES = buildValues("9.8.7", "https://app.example.test");

Deno.test("the mirror fills every placeholder in the landing's HTML", async () => {
  const sink = captureSink();
  await copyLandingSite("docs/site", "out", VALUES, sink);
  const index = sink.texts.get("out/index.html");
  assert(index, "the mirror wrote no out/index.html");
  assert(!index.includes("__SPECNAUT_"), "a placeholder reached the published landing");
  assertStringIncludes(index, "v9.8.7");
  assertStringIncludes(index, `<code>${INSTALL_COMMAND}</code>`);
  assertStringIncludes(index, 'href="https://app.example.test"');
});

Deno.test("every other file is copied byte for byte, never rewritten", async () => {
  const sink = captureSink();
  const written = await copyLandingSite("docs/site", "out", VALUES, sink);
  assertEquals(sink.copies.get("out/landing.js"), "docs/site/landing.js");
  assertEquals(sink.copies.get("out/assets/og-card.png"), "docs/site/assets/og-card.png");
  assertEquals([...sink.texts.keys()].filter((p) => !p.endsWith(".html")), []);
  assertEquals(written.sort(), [...sink.texts.keys(), ...sink.copies.keys()].sort());
  assert(sink.dirs.includes("out/assets"), "the assets directory was not created");
});

Deno.test("a missing site directory mirrors nothing", async () => {
  const sink = captureSink();
  assertEquals(await copyLandingSite("no/such/site-dir", "out", VALUES, sink), []);
  assertEquals([sink.texts.size, sink.copies.size, sink.dirs.length], [0, 0, 0]);
});
