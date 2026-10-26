// The OpenCode install line pins the plugin to a release tag (cli#667). The
// tag is never written here by hand: the docs carry a placeholder, and the
// build fills in the release it resolved, so the published line cannot lag.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { withVersion } from "../scripts/build-docs.ts";

const SPEC = "specnaut@git+https://github.com/specnaut/specnaut-cli.git";
const source = await Deno.readTextFile(new URL("../docs/llms.md", import.meta.url));

Deno.test("the docs pin the OpenCode line through the version placeholder", () => {
  const refs = [...source.matchAll(new RegExp(`${SPEC.replace(/[.+]/g, "\\$&")}(#[^"]*)?`, "g"))]
    .map((m) => m[1]);
  assertEquals(refs, ["#v__SPECNAUT_VERSION__"], "an unpinned or hand-pinned OpenCode line");
});

Deno.test("the build publishes the line pinned to the resolved release", () => {
  const built = withVersion(source, "9.8.7");
  assertStringIncludes(built, `${SPEC}#v9.8.7"`);
  assert(!built.includes("__SPECNAUT_VERSION__"), "a placeholder reached the published docs");
});
