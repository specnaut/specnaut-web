// landing.js runs only in a browser, so these tests run it against the real
// assembled landing, parsed by deno-dom, handing it the browser globals it
// reads (the clipboard, the timers, matchMedia) one page load at a time. They
// check what a visitor sees and hears after a copy: the button's label and the
// #copy-status live region, then the label coming back.

import { assert, assertEquals } from "jsr:@std/assert@^1";
import { DOMParser, type Element, type HTMLDocument } from "jsr:@b-fuze/deno-dom@^0.1.56";
import { buildValues, INSTALL_COMMAND } from "../scripts/build_values.ts";
import { copyLandingSite } from "../scripts/landing.ts";
import { captureSink } from "./_capture_sink.ts";

const SCRIPT = await Deno.readTextFile(new URL("../docs/site/landing.js", import.meta.url));
const LANDING = await assembledLanding();

async function assembledLanding(): Promise<string> {
  const sink = captureSink();
  await copyLandingSite("docs/site", "out", buildValues("9.8.7", "https://app.example.test"), sink);
  return sink.texts.get("out/index.html") ?? "";
}

/** One page load of the landing with `clipboard` as `navigator.clipboard`. */
function load(clipboard: unknown) {
  const document = new DOMParser().parseFromString(LANDING, "text/html") as HTMLDocument;
  // deno-dom does not bubble events, so a click reaches the delegated handler
  // as the browser delivers it: on the document, the clicked element its target.
  const listeners: EventListener[] = [];
  document.addEventListener = (_type: string, fn: EventListenerOrEventListenerObject | null) =>
    void listeners.push(fn as EventListener);
  const timers: { run: () => void; ms: number }[] = [];
  const warnings: unknown[][] = [];
  const globals = {
    document,
    navigator: { clipboard },
    setTimeout: (run: () => void, ms: number) => void timers.push({ run, ms }),
    setInterval: () => 0,
    globalThis: { matchMedia: () => ({ matches: true }) },
    console: { warn: (...args: unknown[]) => void warnings.push(args) },
  };
  new Function(...Object.keys(globals), SCRIPT)(...Object.values(globals));
  return { document, listeners, timers, warnings };
}

/** Clicks the first install button's label and lets the copy's promise settle. */
async function clickInstallCopy(page: ReturnType<typeof load>): Promise<Element> {
  const button = page.document.querySelector('[data-copy-target="install-snippet"]');
  const label = button?.querySelector(".btn-label");
  assert(label, "the landing has no install copy button");
  for (const listener of page.listeners) listener({ target: label } as unknown as Event);
  await new Promise((settled) => setTimeout(settled, 0));
  return label;
}

const status = (page: ReturnType<typeof load>) =>
  page.document.getElementById("copy-status")?.textContent;

const FAILED = {
  label: "Copy failed — select manually",
  status: "Copy failed. Select the text manually.",
  ms: 2500,
};

const OUTCOMES = [
  {
    name: "a written copy",
    clipboard: { writeText: () => Promise.resolve() },
    label: "Copied",
    status: "Copied to the clipboard.",
    ms: 1500,
  },
  { name: "a refused write", clipboard: { writeText: () => Promise.reject(new Error("denied")) } },
  { name: "a missing Clipboard API", clipboard: undefined },
  { name: "a Clipboard API without writeText", clipboard: {} },
];

for (const outcome of OUTCOMES) {
  const expected = { ...FAILED, ...outcome };
  Deno.test(`${outcome.name} shows its outcome, then gives the button its label back`, async () => {
    const page = load(outcome.clipboard);
    const label = await clickInstallCopy(page);
    assertEquals([label.textContent, status(page)], [expected.label, expected.status]);
    assertEquals(page.timers.map((t) => t.ms), [expected.ms]);
    page.timers[0].run();
    assertEquals([label.textContent, status(page)], ["Copy install command", ""]);
    assertEquals(page.warnings.length, "label" in outcome ? 0 : 1, "a failure went unlogged");
  });
}

Deno.test("the copy writes the snippet's text, not the button's", async () => {
  const written: string[] = [];
  const page = load({ writeText: (text: string) => Promise.resolve(void written.push(text)) });
  await clickInstallCopy(page);
  assertEquals(written, [INSTALL_COMMAND]);
});
