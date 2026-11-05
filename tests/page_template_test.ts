// Every generated page shares one shell. A page whose stylesheet or script 404s
// renders unstyled, or with a dead theme toggle, and nothing reports it: the
// asset check scans docs/site, not the pages the build generates.

import { assert, assertEquals } from "jsr:@std/assert@^1";
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
