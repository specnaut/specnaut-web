# specflow-web

The marketing website and documentation for **Specflow** — published to
[specflow.makerlabs.dev](https://specflow.makerlabs.dev) via GitHub Pages.

This content was extracted from the CLI repo
([`mkrlabs/specflow`](https://github.com/mkrlabs/specflow)) so the CLI stays a focused OSS tool and
the site gets its own deploy cadence and ownership. The CLI source itself is **not** here — only the
public site and docs.

## Layout

```
docs/
├── llms.md                      # main documentation (rendered to /docs/, raw at /llms.txt)
├── site/                        # marketing landing page
│   ├── index.html
│   ├── styles.css
│   └── assets/                  # og-card + agent sprites
├── api/gates.md                 # feature reference
├── ops/cloudflare.md            # custom-domain / WAF ops guide
├── cloud-credentials.md
├── headless-vm-mode.md
└── migration-from-superpowers.md
scripts/build-docs.ts            # the static-site builder (Deno + @deno/gfm)
.github/workflows/pages.yml      # build + deploy to GitHub Pages
```

## Build locally

```bash
deno task docs:build      # → docs-dist/ (the published artifact)
```

The build renders `docs/llms.md` to HTML, mirrors `docs/site/` verbatim, emits the `CNAME` for the
custom domain, and writes `version.json`. The displayed Specflow version is resolved from the
**latest `mkrlabs/specflow` release** at build time (the daily Pages workflow keeps it current); a
local build falls back to this repo's `deno.json` version when offline.

## Deploy

`.github/workflows/pages.yml` runs `deno task docs:build` and publishes `docs-dist/` to GitHub Pages
on every push to `main`, on manual dispatch, and on a daily schedule (so a new CLI release is
reflected without a push here). The custom domain `specflow.makerlabs.dev` is served from the
`CNAME` file the build emits into the artifact.

## Design system

UI work on this site follows the shared
[Specflow design system](https://github.com/mkrlabs/specflow-monorepo/blob/main/DESIGN-SYSTEM.md).
