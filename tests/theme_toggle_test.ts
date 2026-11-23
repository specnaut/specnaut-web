// The theme toggle shows one word ("Dark" or "Light", set by theme.js). A
// voice-control user says the word they see, so the button's accessible name
// must start with it (WCAG 2.5.3 Label in Name). These tests run theme.js on
// the landing and on a generated page, in both themes, and compute the name
// the way a browser does for a button: its aria-label when it has one, else
// its text, leaving out what is aria-hidden.

import { assert, assertEquals } from "jsr:@std/assert@^1";
import { DOMParser, type Element, type HTMLDocument } from "jsr:@b-fuze/deno-dom@^0.1.56";
import { pageHtml } from "../scripts/page_template.ts";

const SITE = new URL("../docs/site/", import.meta.url);
const SCRIPT = await Deno.readTextFile(new URL("theme.js", SITE));

const PAGES = {
  landing: await Deno.readTextFile(new URL("index.html", SITE)),
  "a generated page": pageHtml({
    current: "docs",
    title: "Specnaut — a test page",
    description: "An invented description.",
    canonical: "https://specnaut.com/test/",
    twin: "/test.md",
    body: "<p>Invented body.</p>",
    version: "9.8.7",
    appUrl: "https://app.example.test",
  }),
};

/** `html` after theme.js ran, with the OS preferring the dark theme or not. */
function render(html: string, prefersDark: boolean): HTMLDocument {
  const document = new DOMParser().parseFromString(html, "text/html") as HTMLDocument;
  const globals = {
    document,
    globalThis: { matchMedia: () => ({ matches: prefersDark, addEventListener: () => {} }) },
    localStorage: { setItem: () => {} },
    console,
  };
  new Function(...Object.keys(globals), SCRIPT)(...Object.values(globals));
  return document;
}

/** The text a button's name is computed from: every descendant's, minus aria-hidden subtrees. */
function nameText(element: Element): string {
  if (element.getAttribute("aria-hidden") === "true") return "";
  return [...element.childNodes]
    .map((node) => node.nodeType === 3 ? node.textContent : nameText(node as Element))
    .join("");
}

/** The accessible name of `button`: its aria-label, else its own text. */
function accessibleName(button: Element): string {
  const name = button.getAttribute("aria-label") || nameText(button);
  return name.replace(/\s+/g, " ").trim();
}

for (const [page, html] of Object.entries(PAGES)) {
  for (const prefersDark of [true, false]) {
    Deno.test(`on ${page}, in the ${prefersDark ? "dark" : "light"} theme, the toggle's name starts with its word`, () => {
      const document = render(html, prefersDark);
      const button = document.getElementById("theme-toggle");
      const visible = button?.querySelector(".theme-toggle-label")?.textContent;
      assert(button && visible, `${page} has no theme toggle with a label`);
      assertEquals(visible, prefersDark ? "Light" : "Dark", "theme.js did not set the word");
      assertEquals(accessibleName(button), `${visible} theme`);
    });
  }
}
