/**
 * Mirrors the static landing (`docs/site/**`) into the published artifact.
 *
 * The landing is hand-written HTML, so the few values that change with each
 * build reach it as placeholders, substituted in HTML files only. Every other
 * file is copied byte for byte.
 *
 * An HTML file may pull in a partial with `<!-- include: _landing/hero.html -->`
 * on a line of its own, so no landing source outgrows the file-size limit.
 * Partials live in folders whose names start with `_` (`_landing/`): such a
 * folder is read, never published. A file whose name starts with `_` is
 * published like any other, so a hosting file such as `_headers` or
 * `_redirects` reaches the site.
 */

import { substitute } from "./build_values.ts";

/**
 * Where the mirror goes: the file system in a build, a capture in a test. The
 * test task has no write permission, and the landing is what the hero's
 * prompt and the install lines are checked against, so the tests read the
 * mirror's real output through this seam rather than re-deriving it.
 */
export interface SiteSink {
  mkdir(dir: string): Promise<void>;
  writeText(dest: string, text: string): Promise<void>;
  copy(src: string, dest: string): Promise<void>;
}

const FS_SINK: SiteSink = {
  mkdir: (dir) => Deno.mkdir(dir, { recursive: true }),
  writeText: (dest, text) => Deno.writeTextFile(dest, text),
  copy: (src, dest) => Deno.copyFile(src, dest),
};

/** One mirror run: where it writes, what it fills in, and what it has written. */
interface Mirror {
  outDir: string;
  values: Record<string, string>;
  sink: SiteSink;
  written: string[];
}

/**
 * Recursively walk `siteDir` and mirror every file into `outDir`, preserving
 * sub-directory structure. In HTML files every key of `values` is replaced by
 * its value, so the landing can show the current release without a build step
 * of its own.
 *
 * Silently no-ops when `siteDir` does not exist — keeps tests with synthetic
 * temp dirs hermetic while production builds always have `docs/site/` on disk.
 */
export async function copyLandingSite(
  siteDir: string,
  outDir: string,
  values: Record<string, string>,
  sink: SiteSink = FS_SINK,
): Promise<string[]> {
  if (!(await isDirectory(siteDir))) return [];
  const mirror: Mirror = { outDir, values, sink, written: [] };
  await sink.mkdir(outDir);
  await walk(mirror, siteDir, "");
  return mirror.written;
}

/** True for a directory; false for a file or a missing path. */
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return false;
    throw err;
  }
}

/** Mirrors the directory `current`, found at `relative` under the output, recursively. */
async function walk(mirror: Mirror, current: string, relative: string): Promise<void> {
  for await (const entry of Deno.readDir(current)) {
    if (entry.isDirectory && entry.name.startsWith("_")) continue;
    const src = `${current}/${entry.name}`;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const dest = `${mirror.outDir}/${rel}`;
    if (entry.isDirectory) {
      await mirror.sink.mkdir(dest);
      await walk(mirror, src, rel);
    } else if (entry.isFile) {
      await mirrorFile(mirror, src, dest);
      mirror.written.push(dest);
    }
  }
}

/** An HTML file is assembled and gets its placeholders filled; any other file is copied byte for byte. */
async function mirrorFile(mirror: Mirror, src: string, dest: string): Promise<void> {
  if (src.endsWith(".html")) {
    await mirror.sink.writeText(dest, substitute(await assemble(src), mirror.values));
  } else {
    await mirror.sink.copy(src, dest);
  }
}

/** A whole line holding an include directive, its path relative to the including file. */
const INCLUDE = /^[ \t]*<!-- include: ([\w./-]+) -->[ \t]*\n/gm;

/**
 * `src` with each include line replaced by the partial it names, one level
 * deep. A directive left over (a partial that includes another, or a misspelt
 * one) throws: published, it would be a comment where a section should be.
 */
async function assemble(src: string): Promise<string> {
  const html = await Deno.readTextFile(src);
  const dir = src.slice(0, src.lastIndexOf("/"));
  const partials = new Map<string, string>();
  for (const [, path] of html.matchAll(INCLUDE)) {
    partials.set(path, await readPartial(src, `${dir}/${path}`));
  }
  const assembled = html.replace(INCLUDE, (_line, path: string) => partials.get(path)!);
  if (assembled.includes("<!-- include:")) {
    throw new Error(`${src}: an include directive was not expanded`);
  }
  return assembled;
}

/** The partial at `path`; a missing one names the file that includes it, not just its own path. */
async function readPartial(src: string, path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
    throw new Error(`${src}: includes ${path}, which does not exist`, { cause: err });
  }
}
