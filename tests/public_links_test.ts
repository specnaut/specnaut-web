// This repository is public, so every link it carries into the specnaut
// GitHub organisation must open for any reader. The list below is an
// allow-list on purpose: a link to a repository not on it fails, so a new
// repository is refused until someone checks it is public and adds it here.

import { assert, assertEquals } from "jsr:@std/assert@^1";

const PUBLIC_REPOSITORIES = new Set(["specnaut-cli", "specnaut-web"]);

/**
 * A repository of the organisation, in any spelling that names one: a
 * github.com or raw-file URL, an SSH remote (`git@github.com:`), the REST API
 * (`api.github.com/repos/`), or a `gh` repository flag (`-R`, `--repo`,
 * `--repo=`). Group 1 is the repository.
 */
const ORG_LINK =
  /(?:github(?:usercontent)?\.com[/:](?:repos\/)?|(?<![\w-])(?:-R\s+|--repo(?:=|\s+)))specnaut\/([A-Za-z0-9_.-]+)/g;

const ROOT = new URL("../", import.meta.url);

/** Every link in `text` that names a repository off the allow-list. */
function refusedLinks(text: string): string[] {
  return [...text.matchAll(ORG_LINK)]
    .filter(([, name]) => !PUBLIC_REPOSITORIES.has(name.replace(/\.git$/, "")))
    .map(([link]) => link);
}

/** `git ls-files` with `args`, as paths relative to the repository's root. */
async function gitFiles(...args: string[]): Promise<string[]> {
  const out = await new Deno.Command("git", { args: ["ls-files", "-z", ...args], cwd: ROOT })
    .output();
  assert(out.success, `git ls-files failed: ${new TextDecoder().decode(out.stderr)}`);
  return new TextDecoder().decode(out.stdout).split("\0").filter(Boolean);
}

/**
 * Every tracked text file, images skipped. Tracked, not walked: an ignored or
 * untracked local file would otherwise fail the check on one machine and not
 * in CI. A tracked file deleted from the working tree is not there to read.
 */
async function textFiles(): Promise<string[]> {
  const deleted = new Set(await gitFiles("--deleted"));
  return (await gitFiles()).filter((path) =>
    !deleted.has(path) && !/\.(png|jpe?g|webp|ico)$/.test(path)
  );
}

Deno.test("every link into the specnaut organisation names a public repository", async () => {
  const refused: string[] = [];
  let seen = 0;
  for (const path of await textFiles()) {
    const text = await Deno.readTextFile(new URL(path, ROOT));
    seen += [...text.matchAll(ORG_LINK)].length;
    refused.push(...refusedLinks(text).map((link) => `${path}: ${link}`));
  }
  // The site links to the CLI's repository, so a listing or a pattern that finds nothing is broken.
  assert(seen > 0, "no link into the organisation was found");
  assertEquals(refused, [], "links into repositories not on the public allow-list");
});

// Built from parts, so this file's own source names no repository off the list.
const ORG = "specnaut";
const SPELLINGS = [
  (repo: string) => `https://github.com/${ORG}/${repo}`,
  (repo: string) => `https://raw.githubusercontent.com/${ORG}/${repo}/main/README.md`,
  (repo: string) => `git clone git@github.com:${ORG}/${repo}.git`,
  (repo: string) => `curl https://api.github.com/repos/${ORG}/${repo}/releases/latest`,
  (repo: string) => `gh release list -R ${ORG}/${repo}`,
  (repo: string) => `gh issue list --repo ${ORG}/${repo}`,
  (repo: string) => `gh issue list --repo=${ORG}/${repo}`,
];

for (const spell of SPELLINGS) {
  Deno.test(`a repository off the list is refused in: ${spell("<repo>")}`, () => {
    assertEquals(refusedLinks(spell("not-on-the-list")).length, 1);
    assertEquals(refusedLinks(spell("specnaut-cli")), [], "a public repository was refused");
  });
}
