// This repository is public, so every link it carries into the specnaut
// GitHub organisation must open for any reader. The list below is an
// allow-list on purpose: a link to a repository not on it fails, so a new
// repository is refused until someone checks it is public and adds it here.

import { assertEquals } from "jsr:@std/assert@^1";

const PUBLIC_REPOSITORIES = new Set(["specnaut-cli", "specnaut-web"]);

/** A link into the organisation, on github.com or its raw-file host; group 1 is the repository. */
const ORG_LINK = /github(?:usercontent)?\.com\/specnaut\/([A-Za-z0-9_.-]+)/g;

const ROOT = new URL("../", import.meta.url);

/** Never tracked: the clone's own metadata and the build's output (see .gitignore). */
const UNTRACKED = new Set([".git", "docs-dist"]);

/** Every text file of the repository, as a path relative to its root. Images are skipped. */
async function* textFiles(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(new URL(dir, ROOT))) {
    if (UNTRACKED.has(entry.name)) continue;
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory) yield* textFiles(`${path}/`);
    else if (entry.isFile && !/\.(png|jpe?g|webp|ico)$/.test(entry.name)) yield path;
  }
}

Deno.test("every link into the specnaut organisation names a public repository", async () => {
  const refused: string[] = [];
  for await (const path of textFiles("")) {
    const text = await Deno.readTextFile(new URL(path, ROOT));
    for (const [link, name] of text.matchAll(ORG_LINK)) {
      if (!PUBLIC_REPOSITORIES.has(name.replace(/\.git$/, ""))) refused.push(`${path}: ${link}`);
    }
  }
  assertEquals(refused, [], "links into repositories not on the public allow-list");
});
