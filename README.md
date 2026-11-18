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
├── SKILL.md                     # the install skill an agent follows, served at /SKILL.md
├── site/                        # marketing landing page
│   ├── index.html               # the landing's shell; the build fills in its sections
│   ├── _landing/                # one partial per landing section, never published
│   ├── styles.css               # shared by every page
│   ├── landing-*.css            # rules only the landing uses, linked in cascade order
│   ├── landing.css              # … ending with the roster, Cloud and trust bands
│   ├── docs.css                 # rules only the generated pages use
│   ├── changelog.css            # rules only /changelog/ uses
│   ├── theme.js                 # the footer theme toggle, shared
│   ├── landing.js               # the landing's copy buttons and harness rotator
│   └── assets/                  # og-card + agent sprites
├── api/gates.md                 # feature reference
├── ops/hosting.md               # how specnaut.com is served + crawler access
├── cloud-credentials.md
└── headless-vm-mode.md
scripts/build-docs.ts            # the static-site builder (Deno + @deno/gfm)
scripts/build_values.ts          # every __SPECNAUT_…__ placeholder, incl. the one install command
scripts/landing.ts               # mirrors docs/site/, assembles its partials, fills its placeholders
scripts/releases.ts              # every read of the CLI's GitHub Releases
scripts/changelog.ts             # renders /changelog/, /changelog.md, "Recent releases"
.github/workflows/pages.yml      # build + deploy to GitHub Pages
```

## Build locally

```bash
deno task docs:build      # → docs-dist/ (the published artifact)
```

The build renders `docs/llms.md` to HTML, publishes `docs/SKILL.md` (the install skill the landing's
"Copy prompt" names, stamped with the CLI version), mirrors `docs/site/` verbatim, emits the `CNAME`
for the custom domain, writes `version.json`, and renders the Changelog (`/changelog/` and its
Markdown twin `/changelog.md`) from every published CLI release. The displayed Specnaut version is
resolved from the **latest `specnaut/specnaut-cli` release** at build time (the daily Pages workflow
keeps it current); a local build falls back to this repo's `deno.json` version when offline, and its
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

## The install command and the install skill

The `curl … install.sh | bash` line is written once, in `scripts/build_values.ts`; the landing,
`llms.md` and `SKILL.md` carry a placeholder the build fills. `docs/SKILL.md` is run by third-party
agents on users' machines, so review a change to it like code, and audit it whenever a CLI flag it
names changes: `tests/install_skill_test.ts` lists those flags.
