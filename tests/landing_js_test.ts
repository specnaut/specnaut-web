// landing.js runs only in a browser, so these tests run it against the real
// assembled landing, parsed by deno-dom, handing it the browser globals it
// reads (the clipboard, the timers, the frames, the selection, matchMedia) one
// page load at a time. They check what a visitor sees and hears after a copy:
// the button's label and the #copy-status live region, then the label coming
// back. Time is a fake clock the test advances, so a timer that should have
// been cancelled fires where a browser would fire it.

import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@^1";
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

/** A fake clock: the timers and the frames landing.js asks for, run only when a test says so. */
function fakeTime() {
  const clock = { now: 0 };
  const timers: { run: () => void; ms: number; due: number; cancelled: boolean }[] = [];
  const frames: (() => void)[] = [];
  const globals = {
    // A timer's id is its position plus one, so clearTimeout finds it.
    setTimeout: (run: () => void, ms: number) =>
      timers.push({ run, ms, due: clock.now + ms, cancelled: false }),
    clearTimeout: (id: number) => void (timers[id - 1] && (timers[id - 1].cancelled = true)),
    requestAnimationFrame: (run: () => void) => frames.push(run),
    setInterval: () => 0,
  };
  return { clock, timers, frames, globals };
}

/**
 * The listeners added to `document`. deno-dom does not bubble events, so a
 * click reaches the delegated handler as the browser delivers it: on the
 * document, the clicked element its target.
 */
function documentListeners(document: HTMLDocument): EventListener[] {
  const listeners: EventListener[] = [];
  document.addEventListener = (_type: string, fn: EventListenerOrEventListenerObject | null) =>
    void listeners.push(fn as EventListener);
  return listeners;
}

/** One page load of the landing with `clipboard` as `navigator.clipboard`. */
function load(clipboard: unknown) {
  const document = new DOMParser().parseFromString(LANDING, "text/html") as HTMLDocument;
  const listeners = documentListeners(document);
  const time = fakeTime();
  const selected: Element[] = [];
  const warnings: unknown[][] = [];
  const globals = {
    document,
    navigator: { clipboard },
    ...time.globals,
    globalThis: {
      matchMedia: () => ({ matches: true }),
      getSelection: () => ({ selectAllChildren: (node: Element) => void selected.push(node) }),
    },
    console: { warn: (...args: unknown[]) => void warnings.push(args) },
  };
  new Function(...Object.keys(globals), SCRIPT)(...Object.values(globals));
  return { ...time, document, listeners, selected, warnings };
}

type Page = ReturnType<typeof load>;

/** Draws the next frame: runs every callback requested before it. */
function nextFrame(page: Page): void {
  for (const run of page.frames.splice(0)) run();
}

/** Moves the clock on by `ms`, firing every timer that falls due and was not cancelled. */
function advance(page: Page, ms: number): void {
  page.clock.now += ms;
  for (const timer of page.timers) {
    if (timer.cancelled || timer.due > page.clock.now) continue;
    timer.cancelled = true;
    timer.run();
  }
}

/** Clicks the first install button's label and lets the copy's promise settle. */
async function clickInstallCopy(page: Page): Promise<Element> {
  const button = page.document.querySelector('[data-copy-target="install-snippet"]');
  const label = button?.querySelector(".btn-label");
  assert(label, "the landing has no install copy button");
  for (const listener of page.listeners) listener({ target: label } as unknown as Event);
  await new Promise((settled) => setTimeout(settled, 0));
  return label;
}

const status = (page: Page) => page.document.getElementById("copy-status")?.textContent;

const COPIED = { label: "Copied", status: "Copied to the clipboard.", ms: 1500 };
const FAILED = {
  label: "Copy failed — text selected",
  status: "Copy failed. The text is selected: copy it from the keyboard or the menu.",
  ms: 2500,
};

const OUTCOMES = [
  { name: "a written copy", clipboard: { writeText: () => Promise.resolve() }, ...COPIED },
  { name: "a refused write", clipboard: { writeText: () => Promise.reject(new Error("denied")) } },
  { name: "a missing Clipboard API", clipboard: undefined },
  { name: "a Clipboard API without writeText", clipboard: {} },
];

for (const outcome of OUTCOMES) {
  const expected = { ...FAILED, ...outcome };
  Deno.test(`${outcome.name} shows its outcome, then gives the button its label back`, async () => {
    const page = load(outcome.clipboard);
    const label = await clickInstallCopy(page);
    nextFrame(page);
    assertEquals([label.textContent, status(page)], [expected.label, expected.status]);
    assertEquals(page.timers.map((t) => t.ms), [expected.ms]);
    advance(page, expected.ms);
    assertEquals([label.textContent, status(page)], ["Copy install command", ""]);
    assertEquals(page.warnings.length, "label" in outcome ? 0 : 1, "a failure went unlogged");
  });
}

Deno.test("a second click keeps its outcome up for its full duration", async () => {
  const page = load({ writeText: () => Promise.resolve() });
  const label = await clickInstallCopy(page);
  advance(page, COPIED.ms - 500);
  await clickInstallCopy(page);
  nextFrame(page);
  advance(page, 500);
  assertEquals([label.textContent, status(page)], [COPIED.label, COPIED.status], "cut short");
  advance(page, COPIED.ms - 500);
  assertEquals([label.textContent, status(page)], ["Copy install command", ""]);
});

Deno.test("the same outcome twice is announced twice: cleared, then set on the next frame", async () => {
  const page = load({ writeText: () => Promise.resolve() });
  await clickInstallCopy(page);
  nextFrame(page);
  await clickInstallCopy(page);
  assertEquals(status(page), "", "the region was not cleared, so no change to announce");
  nextFrame(page);
  assertEquals(status(page), COPIED.status);
});

Deno.test("a failed copy selects the snippet's text for the visitor", async () => {
  const failed = load(undefined);
  await clickInstallCopy(failed);
  assertEquals(failed.selected, [failed.document.getElementById("install-snippet")!]);
  const copied = load({ writeText: () => Promise.resolve() });
  await clickInstallCopy(copied);
  assertEquals(copied.selected, [], "a written copy took the visitor's selection");
});

Deno.test("the copy writes the snippet's text, not the button's", async () => {
  const written: string[] = [];
  const page = load({ writeText: (text: string) => Promise.resolve(void written.push(text)) });
  await clickInstallCopy(page);
  assertEquals(written, [INSTALL_COMMAND]);
});

Deno.test("the prompt button is described by the prompt's label", () => {
  const button = LANDING.match(/<button[^>]*data-copy-target="agent-prompt"[^>]*>/)?.[0] ?? "";
  assertStringIncludes(button, 'aria-describedby="agent-prompt-label"');
  assertStringIncludes(LANDING, 'id="agent-prompt-label"');
  const pre = LANDING.match(/<pre[^>]*id="agent-prompt"[^>]*>/)?.[0] ?? "";
  assert(pre, "no #agent-prompt block");
  assert(!pre.includes("aria-labelledby"), "aria-labelledby on a <pre>, which has no role to name");
});

Deno.test("copying announces its outcome to screen readers", () => {
  assertMatch(LANDING, /<[a-z]+ [^>]*id="copy-status"[^>]*aria-live="polite"/);
  assertStringIncludes(LANDING, '<script src="/landing.js" defer>');
  assertStringIncludes(SCRIPT, 'getElementById("copy-status")');
});
