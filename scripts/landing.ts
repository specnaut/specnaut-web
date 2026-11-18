/**
 * Mirrors the static landing (`docs/site/**`) into the published artifact.
 *
 * The landing is hand-written HTML with no build step of its own, so the few
 * values that change with each build reach it as placeholders, substituted in
 * HTML files only. Every other file is copied byte for byte.
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

/** An HTML file gets its placeholders filled; any other file is copied byte for byte. */
async function mirrorFile(mirror: Mirror, src: string, dest: string): Promise<void> {
  if (src.endsWith(".html")) {
    await mirror.sink.writeText(dest, substitute(await Deno.readTextFile(src), mirror.values));
  } else {
    await mirror.sink.copy(src, dest);
  }
}
