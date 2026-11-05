// A URL-aware stand-in for `fetch`, so a test can answer each Releases API
// call by its URL and assert on every call the code made. It also sets the
// environment the call runs under (CI, GITHUB_TOKEN) and records the warnings
// a local build prints, restoring all three afterwards.

export type Route = (url: URL) => Response | Promise<Response>;

export interface Seen {
  urls: URL[];
  auth: (string | null)[];
  warnings: string[];
}

export const json = (body: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), { status, headers });

export async function withFetch(
  route: Route,
  env: Record<string, string | undefined>,
  fn: (seen: Seen) => Promise<void>,
): Promise<void> {
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  const seen: Seen = { urls: [], auth: [], warnings: [] };
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    seen.urls.push(url);
    seen.auth.push(new Headers(init?.headers).get("Authorization"));
    return Promise.resolve(route(url));
  };
  console.warn = (...args: unknown[]) => void seen.warnings.push(args.join(" "));
  try {
    await fn(seen);
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}
