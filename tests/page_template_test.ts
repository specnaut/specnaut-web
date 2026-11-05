// Every generated page shares one shell. A page whose stylesheet or script 404s
// renders unstyled, or with a dead theme toggle, and nothing reports it: the
// asset check scans docs/site, not the pages the build generates.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { pageHtml } from "../scripts/page_template.ts";

const SITE = new URL("../docs/site/", import.meta.url);

const page = (current: "docs" | "changelog" = "docs") =>
  pageHtml({
    current,
    title: "Specnaut — a test page",
    description: "An invented description.",
    canonical: "https://specnaut.com/test/",
    twin: "/test.md",
    body: "<p>Invented body.</p>",
    version: "9.8.7",
    appUrl: "https://app.example.test",
  });

Deno.test("every local asset the page shell references exists under docs/site", async () => {
  const refs = [...page().matchAll(/(?:src|href)="(\/[^"]+\.(?:png|svg|css|js))"/g)]
    .map((m) => m[1]);
  assertEquals(refs.sort(), ["/docs.css", "/styles.css", "/theme.js"]);
  for (const ref of refs) {
    const info = await Deno.stat(new URL(ref.slice(1), SITE));
    assert(info.isFile, `${ref} is not a file under docs/site`);
  }
});

Deno.test("the theme toggle has one home, loaded by the landing and the shell", async () => {
  const landing = await Deno.readTextFile(new URL("index.html", SITE));
  for (const [name, html] of [["landing", landing], ["shell", page()]]) {
    assert(html.includes('<script src="/theme.js" defer></script>'), `${name} lacks theme.js`);
    assert(!html.includes("ICON_SUN"), `${name} carries its own copy of the toggle`);
  }
});

Deno.test("the rules only generated pages use live in docs.css, not styles.css", async () => {
  const styles = await Deno.readTextFile(new URL("styles.css", SITE));
  const docs = await Deno.readTextFile(new URL("docs.css", SITE));
  for (const selector of [".markdown-body", ".doc-col", ".band-docs", ".doc-header"]) {
    assert(!styles.includes(selector), `${selector} left in styles.css`);
    assert(docs.includes(selector), `${selector} missing from docs.css`);
  }
});

Deno.test("both primary navs link the Changelog; aria-current marks the current page", async () => {
  const landing = await Deno.readTextFile(new URL("index.html", SITE));
  const nav = (html: string) => html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assertStringIncludes(nav(landing), '<a href="/changelog/">Changelog</a>');
  for (const [current, href] of [["docs", "/docs/"], ["changelog", "/changelog/"]] as const) {
    const links = nav(page(current));
    assertEquals(
      [...links.matchAll(/<a href="([^"]+)" aria-current="page">/g)].map((m) => m[1]),
      [href],
    );
    for (
      const target of ["/", "/docs/", "/changelog/", "https://github.com/specnaut/specnaut-cli"]
    ) {
      assert(links.includes(`href="${target}"`), `${current} nav lacks ${target}`);
    }
  }
});

Deno.test("the CSP allows the inline pre-paint snippet by its hash, and nothing inline else", async () => {
  const html = page();
  const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert(policy, "no CSP meta");
  assert(!policy.includes("unsafe-inline"), "the policy allows inline code");
  assertStringIncludes(policy, "object-src 'none'; base-uri 'none'; form-action 'none'");
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assertEquals(inline.length, 1, "one inline script, the pre-paint snippet");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inline[0]));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  assertStringIncludes(policy, `script-src 'self' 'sha256-${hash}'`);
  assert(html.indexOf("Content-Security-Policy") < html.indexOf("<script"), "CSP after a script");
});
