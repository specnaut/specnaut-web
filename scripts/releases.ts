/**
 * Every read of the CLI's GitHub Releases. This repo carries no CLI source, so
 * the version the site displays, `version.json`, and the release history all
 * come from the public `specnaut/specnaut-cli` releases, and from nowhere else.
 */

/** The only repository whose releases reach the public site (constitution § I). */
export const CLI_REPO = "specnaut/specnaut-cli";
export const REPO_URL = `https://github.com/${CLI_REPO}`;
const API_URL = `https://api.github.com/repos/${CLI_REPO}`;

/**
 * Headers for a GitHub API read. Authenticated with the workflow's run-scoped
 * `GITHUB_TOKEN` when present: unauthenticated calls share a 60/hour quota per
 * runner IP with every other job on that IP, so the build hit 403 on a busy
 * runner even though it makes only a handful of calls.
 */
export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = Deno.env.get("GITHUB_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readVersion(denoJsonPath = "deno.json"): Promise<string> {
  const raw = await Deno.readTextFile(denoJsonPath);
  const { version } = JSON.parse(raw) as { version?: string };
  if (!version) throw new Error(`No "version" field in ${denoJsonPath}`);
  return version;
}

/**
 * Resolve the Specnaut CLI version to display: the latest published release
 * of the CLI, also what `version.json` must report for the `specnaut-guide`
 * agent's installed-vs-latest comparison. Falls back to the local `deno.json`
 * version for offline / local builds so the build never fails on a network
 * hiccup.
 */
export async function resolveVersion(): Promise<string> {
  const url = `${API_URL}/releases/latest`;
  let problem: string;
  try {
    const res = await fetch(url, { headers: githubHeaders() });
    if (res.ok) {
      const { tag_name } = await res.json() as { tag_name?: string };
      if (tag_name) return tag_name.replace(/^v/, "");
      problem = `no tag_name in ${url}`;
    } else {
      await res.body?.cancel();
      problem = `HTTP ${res.status} from ${url}`;
    }
  } catch (err) {
    problem = err instanceof Error ? err.message : String(err);
  }
  // In CI the fallback is this repo's own deno.json — a number that is not the
  // CLI's. Published as version.json it tells every agent a wrong "latest"; a
  // failed deploy keeps the previous, correct one online instead.
  if (Deno.env.get("CI") === "true") {
    throw new Error(`resolveVersion: ${problem} — refusing to publish a fallback version`);
  }
  console.warn(`::warning::resolveVersion: ${problem} — falling back to deno.json (local build)`);
  return await readVersion();
}
