// The changelog lists every CLI release. The repository holds more than one
// page of them, so a single call silently truncates the history; and a partial
// or malformed list published as the whole would be a false page. In CI the
// build fails instead (the previous deploy stays online); locally it warns.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@^1";
import { fetchReleases } from "../scripts/releases.ts";
import { json, type Route, withFetch } from "./_fetch_stub.ts";

const CI = { CI: "true", GITHUB_TOKEN: undefined };
const LOCAL = { CI: undefined, GITHUB_TOKEN: undefined };

/** An invented release `n`, published `n` hours into 2026. */
const entry = (n: number, extra: Record<string, unknown> = {}) => ({
  tag_name: `v1.${Math.floor(n / 100)}.${n % 100}`,
  published_at: new Date(Date.UTC(2026, 0, 1, n)).toISOString().replace(".000Z", "Z"),
  draft: false,
  prerelease: false,
  body: `- Invented change number ${n}`,
  ...extra,
});
const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => entry(from + i));

/** Answers `?page=N` from `pages[N - 1]`; a page past the end is empty. */
const paged = (pages: unknown[]): Route => (url) => {
  const page = Number(url.searchParams.get("page"));
  return pages[page - 1] instanceof Response
    ? pages[page - 1] as Response
    : json(pages[page - 1] ?? []);
};

Deno.test("fetchReleases follows every page: 100 + 27 gives 127 entries in 2 calls", async () => {
  const link = { Link: '<https://elsewhere.example/releases?page=2>; rel="next"' };
  const route: Route = (url) =>
    url.searchParams.get("page") === "1" ? json(range(0, 100), 200, link) : json(range(100, 27));
  await withFetch(route, CI, async (seen) => {
    const releases = await fetchReleases();
    assertEquals(releases?.length, 127);
    assertEquals(seen.urls.length, 2);
    for (const [i, url] of seen.urls.entries()) {
      assertEquals(url.origin, "https://api.github.com", "followed a Link URL");
      assertEquals(url.pathname, "/repos/specnaut/specnaut-cli/releases");
      assertEquals(url.searchParams.get("per_page"), "100");
      assertEquals(url.searchParams.get("page"), String(i + 1));
    }
  });
});

Deno.test("fetchReleases stops at an empty page: 100 + [] gives 100 entries", async () => {
  await withFetch(paged([range(0, 100), []]), CI, async (seen) => {
    assertEquals((await fetchReleases())?.length, 100);
    assertEquals(seen.urls.length, 2);
  });
});

Deno.test("fetchReleases refuses after exactly 20 full pages", async () => {
  const full: Route = (url) => json(range(Number(url.searchParams.get("page")) * 100, 100));
  await withFetch(full, CI, async (seen) => {
    await assertRejects(() => fetchReleases(), Error, "20 pages");
    assertEquals(seen.urls.length, 20);
  });
  await withFetch(full, LOCAL, async (seen) => {
    assertEquals(await fetchReleases(), null);
    assertEquals(seen.urls.length, 20);
  });
});

Deno.test("a failed page 2 never publishes page 1 as the whole history", async () => {
  const pages = [range(0, 100), json({ message: "boom" }, 500)];
  await withFetch(paged(pages), CI, async () => {
    await assertRejects(() => fetchReleases(), Error, "HTTP 500");
  });
  await withFetch(paged(pages), LOCAL, async (seen) => {
    assertEquals(await fetchReleases(), null);
    assertEquals(seen.warnings.length, 1);
  });
});

Deno.test("a malformed or empty list fails CI and warns locally", async () => {
  const { published_at: _, ...undated } = entry(1);
  const cases: [string, unknown][] = [
    ["an empty list", []],
    ["a non-array", { message: "Not Found" }],
    ["a missing published_at", [entry(2), undated]],
    ["a tag holding <", [entry(1, { tag_name: "v1.0.0<script>" })]],
  ];
  for (const [name, page] of cases) {
    await withFetch(paged([page]), CI, async () => {
      await assertRejects(() => fetchReleases(), Error, undefined, name);
    });
    await withFetch(paged([page]), LOCAL, async (seen) => {
      assertEquals(await fetchReleases(), null, name);
      assertEquals(seen.warnings.length, 1, name);
      assert(!seen.warnings[0].includes("<script>"), `${name}: the payload reached the log`);
    });
  }
});

Deno.test("fetchReleases sorts newest first, drops drafts and keeps the prerelease flag", async () => {
  const page = [
    entry(2),
    entry(5, { prerelease: true }),
    entry(9, { draft: true, published_at: null }),
    entry(1),
    entry(7),
  ];
  await withFetch(paged([page]), CI, async () => {
    const releases = await fetchReleases();
    assertEquals(releases?.map((r) => r.tag), ["v1.0.7", "v1.0.5", "v1.0.2", "v1.0.1"]);
    assertEquals(releases?.map((r) => r.prerelease), [false, true, false, false]);
    assertEquals(releases?.[0], {
      tag: "v1.0.7",
      publishedAt: "2026-01-01T07:00:00Z",
      prerelease: false,
      body: "- Invented change number 7",
    });
  });
});
