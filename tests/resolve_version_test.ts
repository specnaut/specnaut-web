// specnaut.com/version.json is what an agent compares an installed CLI
// against. It once published "1.0.0" — this repo's own deno.json — because the
// unauthenticated release lookup hit a 403 on a shared Actions runner and the
// build fell back without failing. A wrong "latest" is worse than a failed
// deploy: the previous deploy keeps serving the right number.

import { assertEquals, assertRejects } from "jsr:@std/assert@^1";
import { resolveVersion } from "../scripts/build-docs.ts";

type Seen = { auth: string | null };

async function withFetch(
  status: number,
  env: Record<string, string | undefined>,
  fn: (seen: Seen) => Promise<void>,
): Promise<void> {
  const realFetch = globalThis.fetch;
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  const seen: Seen = { auth: null };
  globalThis.fetch = (_url: string | URL | Request, init?: RequestInit) => {
    seen.auth = new Headers(init?.headers).get("Authorization");
    return Promise.resolve(
      new Response(status === 200 ? JSON.stringify({ tag_name: "v9.8.7" }) : "{}", { status }),
    );
  };
  try {
    await fn(seen);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("resolveVersion authenticates when the workflow provides a token", async () => {
  await withFetch(200, { GITHUB_TOKEN: "t0k", CI: "true" }, async (seen) => {
    assertEquals(await resolveVersion(), "9.8.7");
    assertEquals(seen.auth, "Bearer t0k");
  });
});

Deno.test("resolveVersion fails the CI build instead of publishing a fallback", async () => {
  await withFetch(403, { GITHUB_TOKEN: undefined, CI: "true" }, async () => {
    await assertRejects(() => resolveVersion(), Error, "403");
  });
});

Deno.test("resolveVersion still falls back to deno.json for a local build", async () => {
  await withFetch(403, { GITHUB_TOKEN: undefined, CI: undefined }, async () => {
    assertEquals(await resolveVersion(), JSON.parse(Deno.readTextFileSync("deno.json")).version);
  });
});
