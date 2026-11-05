// A URL-aware stand-in for `fetch`, so a test can answer each Releases API
// call by its URL and assert on every call the code made. It also sets the
// environment the call runs under (CI, GITHUB_TOKEN) and records the warnings
// a local build prints, restoring all three afterwards.

export type Route = (url: URL) => Response | Promise<Response>;

export interface Seen {
  urls: URL[];
  auth: (string | null)[];
  redirect: (RequestRedirect | undefined)[];
  warnings: string[];
}

export const json = (body: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), { status, headers });

/** Sets (or deletes, for `undefined`) each variable; returns the previous values. */
function setEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    previous[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  return previous;
}

export async function withFetch(
  route: Route,
  env: Record<string, string | undefined>,
  fn: (seen: Seen) => Promise<void>,
): Promise<void> {
  const [realFetch, realWarn, saved] = [globalThis.fetch, console.warn, setEnv(env)];
  const seen: Seen = { urls: [], auth: [], redirect: [], warnings: [] };
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    seen.urls.push(url);
    seen.auth.push(new Headers(init?.headers).get("Authorization"));
    seen.redirect.push(init?.redirect);
    return Promise.resolve(route(url));
  };
  console.warn = (...args: unknown[]) => void seen.warnings.push(args.join(" "));
  try {
    await fn(seen);
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
    setEnv(saved);
  }
}
