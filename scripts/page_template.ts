/**
 * The shell every generated page is rendered into (`/docs/`, `/changelog/`).
 * One template, so the header, the footer, the stylesheets and the theme
 * toggle cannot drift between pages. The landing (`docs/site/index.html`) is
 * hand-written and loads the same `styles.css` and `theme.js`.
 */
import { CLI_REPO, REPO_URL } from "./releases.ts";

/** Which page is being rendered: decides the breadcrumb and `aria-current`. */
export type PageKey = "docs" | "changelog";

const CRUMB: Record<PageKey, string> = {
  docs: "Documentation",
  changelog: "Changelog",
};

/**
 * Applies the saved theme before first paint. Inline on purpose: loaded from
 * `theme.js` (deferred) it would run after the first paint and flash the
 * other theme.
 */
const PRE_PAINT = `
      try {
        var t = localStorage.getItem("theme");
        if (t) document.documentElement.dataset.theme = t;
      } catch (e) {
        console.warn("theme: saved value unreadable", e);
      }
    `;

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/**
 * The policy of every generated page. The Changelog renders release bodies,
 * which contributors write; the sanitizer is the first line, this is the
 * second: no inline script but the pre-paint snippet (allowed by its hash,
 * computed from the constant so the two cannot drift), no inline style, and
 * images or video only from this site and GitHub's hosts.
 */
const CSP = [
  `script-src 'self' 'sha256-${await sha256Base64(PRE_PAINT)}'`,
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://github.com https://*.githubusercontent.com",
  "media-src 'self' https://github.com https://*.githubusercontent.com",
  "object-src 'none'; base-uri 'none'; form-action 'none'",
].join("; ");

/** The primary nav of generated pages; the landing's lives in its index.html. */
const NAV: ReadonlyArray<{ href: string; label: string; page?: PageKey }> = [
  { href: "/", label: "Home" },
  { href: "/docs/", label: "Docs", page: "docs" },
  { href: "/changelog/", label: "Changelog", page: "changelog" },
  { href: REPO_URL, label: "GitHub" },
];

function navLinks(current: PageKey, appUrl: string): string {
  const links = NAV.map(({ href, label, page }) =>
    `<a href="${href}"${page === current ? ' aria-current="page"' : ""}>${label}</a>`
  );
  links.push(`<a class="nav-cloud" href="${appUrl}">Cloud →</a>`);
  return links.join("\n          ");
}

export interface PageOptions {
  current: PageKey;
  title: string;
  description: string;
  /** Absolute canonical URL of the page. */
  canonical: string;
  /** Path of the page's agent-readable Markdown twin. */
  twin: string;
  /** Inner HTML, already rendered and sanitized by the caller. */
  body: string;
  version: string;
  appUrl: string;
}

export function pageHtml(o: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />

    <title>${o.title}</title>
    <meta name="description" content="${o.description}" />
    <meta name="specnaut-version" content="${o.version}" />

    <link rel="canonical" href="${o.canonical}" />
    <link rel="alternate" type="text/markdown" href="${o.twin}" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/docs.css" />

    <!-- Apply the saved theme before first paint to avoid a flash. -->
    <script>${PRE_PAINT}</script>
    <script src="/theme.js" defer></script>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400&display=swap"
      rel="stylesheet"
    />
  </head>

  <body>
    <header class="band band-header">
      <div class="wrap site-header">
        <a href="/" class="brand" aria-label="Specnaut home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name">Specnaut</span>
        </a>
        <nav class="site-nav" aria-label="Primary">
          ${navLinks(o.current, o.appUrl)}
        </nav>
      </div>
    </header>

    <main>
      <section class="band band-docs">
        <div class="wrap">
          <div class="doc-col">
            <p class="doc-header">
              ← <a href="/">Specnaut home</a> · ${CRUMB[o.current]}
            </p>
${o.body}
          </div>
        </div>
      </section>
    </main>

    <footer class="band band-footer">
      <div class="wrap site-footer">
        <p>
          Specnaut
          <a href="${REPO_URL}/releases/tag/v${o.version}">v${o.version}</a>
          · <a href="/llms.txt">llms.txt</a>
          · <a href="${REPO_URL}">github.com/${CLI_REPO}</a>
        </p>
        <button
          type="button"
          class="theme-toggle"
          id="theme-toggle"
          aria-label="Toggle dark and light theme"
        >
          <span class="theme-toggle-icon" aria-hidden="true"></span>
          <span class="theme-toggle-label">Dark</span>
        </button>
      </div>
    </footer>
  </body>
</html>
`;
}
