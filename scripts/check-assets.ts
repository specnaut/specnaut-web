// check-assets — every local asset the site references must exist on disk.
//
// A rebrand renamed an agent sprite in the markup but not on disk, and the
// site shipped a 404 in its agent roster for as long as nobody scrolled to it. The sprites carry `alt=""` — correct,
// since the adjacent <figcaption> names the agent — so a missing one renders
// as a silent empty box rather than broken-image text. Nothing anywhere
// reported it.
//
// Usage: deno run --allow-read scripts/check-assets.ts [dir]   (default docs/site)

// Run from the repo root, like `docs:build`. No @std/path so this stays
// dependency-free — it must be runnable in CI before anything is installed.
const SITE = Deno.args[0] ?? "docs/site";

const join = (...parts: string[]) => parts.join("/");

async function fileExists(p: string): Promise<boolean> {
  try {
    return (await Deno.stat(p)).isFile;
  } catch {
    return false;
  }
}

async function* htmlFiles(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory) yield* htmlFiles(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

const missing: string[] = [];
let checked = 0;

for await (const file of htmlFiles(SITE)) {
  const html = await Deno.readTextFile(file);
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:png|jpe?g|svg|webp|css|js))"/g)) {
    const ref = m[1];
    checked++;
    if (!(await fileExists(join(SITE, ref.slice(1))))) {
      missing.push(`${file} → ${ref}`);
    }
  }
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} referenced asset(s) do not exist:`);
  for (const m of missing) console.error(`    ${m}`);
  Deno.exit(1);
}
console.log(`✓ ${checked} referenced asset(s) all present`);
