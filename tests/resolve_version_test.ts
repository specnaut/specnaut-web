// specnaut.com/version.json is what an agent compares an installed CLI
// against. It once published "1.0.0" — this repo's own deno.json — because the
// unauthenticated release lookup hit a 403 on a shared Actions runner and the
// build fell back without failing. A wrong "latest" is worse than a failed
// deploy: the previous deploy keeps serving the right number.

import { assertEquals, assertRejects } from "jsr:@std/assert@^1";
import { resolveVersion } from "../scripts/releases.ts";
import { json, withFetch } from "./_fetch_stub.ts";

const LATEST = "https://api.github.com/repos/specnaut/specnaut-cli/releases/latest";
const latest = (status: number, tag = "v9.8.7") => () =>
  status === 200 ? json({ tag_name: tag }) : json({}, status);

Deno.test("resolveVersion authenticates when the workflow provides a token", async () => {
  await withFetch(latest(200), { GITHUB_TOKEN: "t0k", CI: "true" }, async (seen) => {
    assertEquals(await resolveVersion(), "9.8.7");
    assertEquals(seen.urls.map(String), [LATEST]);
    assertEquals(seen.auth, ["Bearer t0k"]);
    assertEquals(seen.redirect, ["error"], "a redirect would be followed");
  });
});

Deno.test("resolveVersion fails the CI build instead of publishing a fallback", async () => {
  await withFetch(latest(403), { GITHUB_TOKEN: undefined, CI: "true" }, async () => {
    await assertRejects(() => resolveVersion(), Error, "403");
  });
});

Deno.test("resolveVersion still falls back to deno.json for a local build", async () => {
  await withFetch(latest(403), { GITHUB_TOKEN: undefined, CI: undefined }, async (seen) => {
    assertEquals(await resolveVersion(), JSON.parse(Deno.readTextFileSync("deno.json")).version);
    assertEquals(seen.warnings.length, 1);
  });
});

// The version lands in the page's <meta>, its footer link and version.json:
// a tag that is not a version is refused like an outage, never published.
Deno.test("resolveVersion refuses a latest tag that is not a version", async () => {
  await withFetch(latest(200, 'v1.0.0"><b>'), { CI: "true" }, async () => {
    await assertRejects(() => resolveVersion(), Error, "tag_name");
  });
});
