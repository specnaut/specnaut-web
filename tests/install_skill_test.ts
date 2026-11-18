// specnaut.com/SKILL.md is executed by third-party coding agents on users'
// machines: whatever it says to run, they run. So it is checked like code —
// it must parse as a skill, carry the release it was built for, name the one
// canonical installer, and name no CLI flag nobody audited. The landing's
// "Copy prompt" sends agents to it, so the prompt must name a file the build
// actually publishes.

import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@^1";
import { extract } from "jsr:@std/front-matter@^1/yaml";
import { buildDocs } from "../scripts/build-docs.ts";
import {
  buildValues,
  INSTALL_COMMAND,
  installVariants,
  SITE_URL,
  substitute,
} from "../scripts/build_values.ts";

const VERSION = "9.8.7";
const APP_URL = "https://app.example.test";
const read = (path: string) => Deno.readTextFile(new URL(`../${path}`, import.meta.url));

/** The generated files of a real build, with every write captured instead of made. */
async function build(): Promise<Record<string, string>> {
  let written: Record<string, string> = {};
  await buildDocs({
    siteDir: "no/such/site-dir",
    outDir: "no/such/out-dir",
    version: VERSION,
    appUrl: APP_URL,
    fetchReleases: () => Promise.resolve(null),
    write: (_outDir, files) => {
      written = files;
      return Promise.resolve();
    },
  });
  return written;
}

/** The landing as the build publishes it: the same substitution, the real source. */
async function landing(): Promise<string> {
  return substitute(await read("docs/site/index.html"), buildValues(VERSION, APP_URL));
}

const files = await build();
const skill = files["SKILL.md"];

Deno.test("SKILL.md is published and parses as a skill stamped with the release", () => {
  assert(skill, "the build publishes no SKILL.md");
  const { attrs } = extract<Record<string, unknown>>(skill);
  assertEquals(attrs.name, "install-specnaut");
  assertEquals(attrs.license, "MIT");
  assertEquals((attrs.metadata as Record<string, unknown>)?.version, VERSION);
  const description = String(attrs.description);
  for (const trigger of ["install Specnaut", "set up Specnaut", "add Specnaut to this repo"]) {
    assertStringIncludes(description, trigger);
  }
});

Deno.test("every install line in SKILL.md, llms.txt and the landing is the single source", async () => {
  const allowed = new Set([INSTALL_COMMAND, ...Object.values(installVariants(VERSION))]);
  assertStringIncludes(skill, INSTALL_COMMAND);
  for (
    const [where, text] of [
      ["SKILL.md", skill],
      ["llms.txt", files["llms.txt"]],
      ["index.html", await landing()],
    ]
  ) {
    const lines = [...text.matchAll(/curl [^\n<`]*install\.sh[^\n<`]*/g)].map((m) => m[0]);
    assert(lines.length > 0, `${where} carries no install line`);
    for (const line of lines) assert(allowed.has(line), `${where}: hand-typed "${line}"`);
  }
});

Deno.test("no source spells the installer URL by hand", async () => {
  for (const path of ["docs/SKILL.md", "docs/llms.md", "docs/site/index.html"]) {
    const source = await read(path);
    assert(!source.includes("install.sh |"), `${path} types an install line`);
    assert(!source.includes("specnaut-cli/main/install.sh"), `${path} types the installer URL`);
  }
});

Deno.test("SKILL.md names only the CLI flags audited against the CLI's parser", () => {
  // Checked against specnaut-cli's src/cli/parser.ts and `specnaut --help` on
  // 2026-11-18. A flag added to the skill, or renamed in the CLI, is audited
  // here first: an agent passes whatever this file names.
  const flags = new Set(skill.match(/(?<![\w-])--[a-z][a-z-]*/g));
  assertEquals([...flags].sort(), [
    "--ai",
    "--backlog",
    "--backlog-url",
    "--dry-run",
    "--force",
    "--here",
    "--project",
    "--reset-baseline",
    "--reset-preserved",
    "--scheme",
    "--spec-backend",
    "--version",
  ]);
});

Deno.test("SKILL.md never runs the token command and links out for detail", () => {
  const sentences = skill.replace(/\s+/g, " ").split(/(?<=[.!?]) /);
  const naming = sentences.filter((s) => s.includes("cloud token"));
  assert(naming.length > 0, "the must-not on the token command is gone");
  for (const sentence of naming) {
    assertMatch(sentence, /\bnever\b/i, `"cloud token" outside a must-not: ${sentence}`);
  }
  assertStringIncludes(skill, `${SITE_URL}/docs/`);
  assertStringIncludes(skill, `${SITE_URL}/llms.txt`);
});

Deno.test("the hero's copied prompt names a file the build publishes", async () => {
  const html = await landing();
  assertStringIncludes(html, 'data-copy-target="agent-prompt"');
  const prompt = html.match(/id="agent-prompt"[^>]*>(?:<code>)?([^<]*)</)?.[1];
  assert(prompt, "no #agent-prompt text in the landing");
  const url = prompt.match(/https:\/\/\S+/)?.[0] ?? "";
  assert(url.startsWith(`${SITE_URL}/`), `the prompt names no ${SITE_URL} URL: ${prompt}`);
  const path = url.slice(SITE_URL.length + 1);
  assert(path in files, `the prompt names ${path}, which the build does not publish`);
});

Deno.test("copying announces its outcome to screen readers", async () => {
  const html = await landing();
  assertMatch(html, /<[a-z]+ [^>]*id="copy-status"[^>]*aria-live="polite"/);
  assertStringIncludes(html, '<script src="/landing.js" defer>');
  assertStringIncludes(await read("docs/site/landing.js"), 'getElementById("copy-status")');
});

Deno.test("no placeholder survives into a published file", async () => {
  for (const [path, text] of [...Object.entries(files), ["index.html", await landing()]]) {
    assert(!text.includes("__SPECNAUT_"), `${path} keeps a placeholder`);
  }
});
