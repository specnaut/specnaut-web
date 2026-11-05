# specnaut-web

The marketing website and documentation for **Specnaut** — published to
[specnaut.com](https://specnaut.com) via GitHub Pages.

This content was extracted from the CLI repo
([`specnaut/specnaut-cli`](https://github.com/specnaut/specnaut-cli)) so the CLI stays a focused OSS
tool and the site gets its own deploy cadence and ownership. The CLI source itself is **not** here —
only the public site and docs.

## Layout

```
docs/
├── llms.md                      # main documentation (rendered to /docs/, raw at /llms.txt)
├── site/                        # marketing landing page
│   ├── index.html
│   ├── styles.css
│   ├── docs.css                 # rules only the generated pages use
│   ├── theme.js                 # the footer theme toggle, shared
│   └── assets/                  # og-card + agent sprites
├── api/gates.md                 # feature reference
├── ops/hosting.md               # how specnaut.com is served + crawler access
├── cloud-credentials.md
└── headless-vm-mode.md
scripts/build-docs.ts            # the static-site builder (Deno + @deno/gfm)
scripts/releases.ts              # every read of the CLI's GitHub Releases
scripts/changelog.ts             # renders /changelog/, /changelog.md, "Recent releases"
.github/workflows/pages.yml      # build + deploy to GitHub Pages
```

## Build locally

```bash
deno task docs:build      # → docs-dist/ (the published artifact)
```

The build renders `docs/llms.md` to HTML, mirrors `docs/site/` verbatim, emits the `CNAME` for the
custom domain, writes `version.json`, and renders the Changelog (`/changelog/` and its Markdown twin
`/changelog.md`) from every published CLI release. The displayed Specnaut version is resolved from
the **latest `specnaut/specnaut-cli` release** at build time (the daily Pages workflow keeps it
current); a local build falls back to this repo's `deno.json` version when offline, and its
Changelog says the release history is unavailable. In CI an unusable API answer fails the build
instead, so the previous deploy stays online.

## Deploy

`.github/workflows/pages.yml` runs `deno task docs:build` and publishes `docs-dist/` to GitHub Pages
on every push to `main`, on manual dispatch, and on a daily schedule (so a new CLI release is
reflected without a push here). The custom domain `specnaut.com` is served from the `CNAME` file the
build emits into the artifact.

## Design system

UI work on this site follows the shared
[Specnaut design system](https://github.com/specnaut/specnaut-monorepo/blob/main/DESIGN-SYSTEM.md).
