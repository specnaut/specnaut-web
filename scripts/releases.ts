/**
 * Every read of the CLI's GitHub Releases. This repo carries no CLI source, so
 * the version the site displays, `version.json`, and the release history all
 * come from the public `specnaut/specnaut-cli` releases, and from nowhere else.
 */
import type { Release } from "./changelog.ts";

/** The only repository whose releases reach the public site (constitution § I). */
export const CLI_REPO = "specnaut/specnaut-cli";
export const REPO_URL = `https://github.com/${CLI_REPO}`;
const API_URL = `https://api.github.com/repos/${CLI_REPO}`;

/** A release tag the site may interpolate: `v` + SemVer core + optional pre-release. */
export const TAG_PATTERN = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
/** GitHub's `published_at`: UTC, second precision. */
export const PUBLISHED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const PER_PAGE = 100;
/** 2000 releases: far past the history, short of an endless pagination loop. */
const MAX_PAGES = 20;

/**
 * Options for every GitHub API read. `redirect: "error"`: the URL is fixed, so
 * a redirect is never a legitimate answer and is refused rather than followed.
 */
const apiInit = (): RequestInit => ({ headers: githubHeaders(), redirect: "error" });

/**
 * Headers for a GitHub API read. Authenticated with the workflow's run-scoped
 * `GITHUB_TOKEN` when present: unauthenticated calls share a 60/hour quota per
 * runner IP with every other job on that IP, so the build hit 403 on a busy
 * runner even though it makes only a handful of calls.
 */
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = Deno.env.get("GITHUB_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * The one rule for an unusable answer from the API: fail a CI build, warn a
 * local one. In CI a fallback would publish a false page (a wrong "latest", an
 * empty or partial history); a failed deploy keeps the previous, correct site
 * online instead. Locally the build keeps working offline.
 */
function refuseOrWarn(problem: string, localFallback: string): null {
  if (Deno.env.get("CI") === "true") {
    throw new Error(`${problem} — refusing to publish a fallback in CI`);
  }
  console.warn(`::warning::${problem} — ${localFallback} (local build)`);
  return null;
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
 * agent's installed-vs-latest comparison. A separate `/releases/latest` call
 * on purpose, not derived from the list: GitHub's "latest" leaves out
 * prereleases and honours a release's `make_latest`.
 */
export async function resolveVersion(): Promise<string> {
  const url = `${API_URL}/releases/latest`;
  let problem: string;
  try {
    const res = await fetch(url, apiInit());
    if (res.ok) {
      const { tag_name } = await res.json() as { tag_name?: unknown };
      if (typeof tag_name === "string" && TAG_PATTERN.test(tag_name)) return tag_name.slice(1);
      problem = `no version-shaped tag_name in ${url}`;
    } else {
      await res.body?.cancel();
      problem = `HTTP ${res.status} from ${url}`;
    }
  } catch (err) {
    problem = err instanceof Error ? err.message : String(err);
  }
  refuseOrWarn(`resolveVersion: ${problem}`, "falling back to deno.json");
  return await readVersion();
}

/**
 * One API entry as a `Release`, `null` for a draft, or the reason it is
 * refused. The reason names the field, never its value: the value is
 * untrusted and would land in a CI log that parses `::` commands.
 */
function parseEntry(e: unknown, where: string): Release | null | string {
  if (typeof e !== "object" || e === null) return `${where}: not an object`;
  const { draft, tag_name, published_at, prerelease, body } = e as Record<string, unknown>;
  if (draft === true) return null;
  if (typeof tag_name !== "string" || !TAG_PATTERN.test(tag_name)) {
    return `${where}: tag_name is not a version`;
  }
  if (typeof published_at !== "string" || !PUBLISHED_AT_PATTERN.test(published_at)) {
    return `${where}: published_at is not a UTC timestamp`;
  }
  return {
    tag: tag_name,
    publishedAt: published_at,
    prerelease: prerelease === true,
    body: typeof body === "string" ? body : "",
  };
}

/** One page of the list, or the reason it cannot be used. */
async function fetchPage(url: string): Promise<unknown[] | string> {
  try {
    const res = await fetch(url, apiInit());
    if (!res.ok) {
      await res.body?.cancel();
      return `HTTP ${res.status} from ${url}`;
    }
    const entries = await res.json();
    return Array.isArray(entries) ? entries : `${url} did not return a list`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const newestFirst = (a: Release, b: Release) =>
  a.publishedAt === b.publishedAt ? 0 : a.publishedAt < b.publishedAt ? 1 : -1;

/**
 * Every published CLI release, newest first by `published_at`, or `null` (a
 * local build) when the list cannot be trusted whole. Reads `?page=N` from a
 * fixed URL and never follows a `Link` header; stops at the first short page.
 * Any failed page, malformed entry or an empty list refuses the whole list:
 * the pages already read are never published as the history.
 */
export async function fetchReleases(): Promise<Release[] | null> {
  const refuse = (problem: string) =>
    refuseOrWarn(`fetchReleases: ${problem}`, "the changelog shows a notice");
  const releases: Release[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entries = await fetchPage(`${API_URL}/releases?per_page=${PER_PAGE}&page=${page}`);
    if (typeof entries === "string") return refuse(entries);
    for (const [i, e] of entries.entries()) {
      const parsed = parseEntry(e, `page ${page} entry ${i}`);
      if (typeof parsed === "string") return refuse(parsed);
      if (parsed) releases.push(parsed);
    }
    if (entries.length < PER_PAGE) {
      return releases.length === 0 ? refuse("no published release") : releases.sort(newestFirst);
    }
  }
  return refuse(`more than ${MAX_PAGES} pages of releases`);
}
