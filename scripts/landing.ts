/**
 * Mirrors the static landing (`docs/site/**`) into the published artifact.
 *
 * The landing is hand-written HTML with no build step of its own, so the few
 * values that change with each build reach it as placeholders, substituted in
 * HTML files only. Every other file is copied byte for byte.
 */

import { substitute } from "./build_values.ts";

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
): Promise<string[]> {
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(siteDir);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    throw err;
  }
  if (!stat.isDirectory) return [];

  const written: string[] = [];

  async function walk(current: string, relative: string): Promise<void> {
    for await (const entry of Deno.readDir(current)) {
      const src = `${current}/${entry.name}`;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const dest = `${outDir}/${rel}`;
      if (entry.isDirectory) {
        await Deno.mkdir(dest, { recursive: true });
        await walk(src, rel);
        continue;
      }
      if (entry.isFile) {
        if (entry.name.endsWith(".html")) {
          await Deno.writeTextFile(dest, substitute(await Deno.readTextFile(src), values));
        } else {
          await Deno.copyFile(src, dest);
        }
        written.push(dest);
      }
    }
  }

  await Deno.mkdir(outDir, { recursive: true });
  await walk(siteDir, "");
  return written;
}
