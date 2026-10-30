# Specnaut

> Specnaut is an enhanced fork of the
> [`specify` CLI from GitHub Spec Kit](https://github.com/github/spec-kit), distributed as a single
> native binary (no Python prerequisites). It scaffolds the files your AI coding harness consumes —
> SpecKit slash-commands, a plan template, a constitution, agents, and a backlog system — directly
> into an existing project, in one command.

Specnaut does **not** call any LLM and does **not** orchestrate any agent at runtime. Your AI
harness (Claude Code, Cursor, Codex, GitHub Copilot CLI, OpenCode, Antigravity) is what reads the
generated files and acts on them.

This page is the canonical documentation. The same content is available as raw Markdown at
[`/llms.txt`](/llms.txt) for LLM consumption — see [llmstxt.org](https://llmstxt.org/) for the
convention.

## Install

The fastest path on macOS or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/specnaut/specnaut-cli/main/install.sh | bash
```

The installer downloads the platform binary, verifies the SHA256 checksum, and places it in
`/usr/local/bin` (auto-elevating via `sudo` if needed). On non-writable prefixes with no terminal it
falls back to `~/.local/bin`.

Pin a specific version:

```bash
curl -fsSL https://.../install.sh | VERSION=v0.7.1 bash
```

Custom install dir:

```bash
curl -fsSL https://.../install.sh | PREFIX=$HOME/.local/bin bash
```

Or via Homebrew (macOS / Linux):

```bash
brew tap specnaut/tap
brew install specnaut
```

Manual download: pick the binary for your OS/arch from
[GitHub Releases](https://github.com/specnaut/specnaut-cli/releases), `chmod +x`, place it on your
`$PATH`. On macOS clear the quarantine attribute with
`xattr -d com.apple.quarantine /path/to/specnaut`.

### Install as a plugin / extension (five harnesses)

If you want Specnaut's skills and sub-agents available across **all your projects** without running
`specnaut init`, install Specnaut as a plugin / extension in your harness. Specnaut ships adapters
for five harnesses with the same skill content across all of them — the three top-level skills
(`task`, `specnaut`, `ship`) and their phase docs, the other bundled skills and the sub-agents. A
plugin injects nothing into a session: the harness discovers the skills and agents from the plugin
itself.

| Harness                | Install command                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**        | `/plugin marketplace add specnaut/specnaut-marketplace`<br/>`/plugin install specnaut-plugin@specnaut-marketplace`               |
| **Codex CLI / App**    | `/plugins` → search "specnaut" → install (once the marketplace listing lands; see Notes)                                         |
| **Cursor**             | `/add-plugin specnaut/specnaut-cli`                                                                                              |
| **OpenCode**           | Add `"plugin": ["specnaut@git+https://github.com/specnaut/specnaut-cli.git#v__SPECNAUT_VERSION__"]` to `opencode.json`           |
| **GitHub Copilot CLI** | `copilot plugin marketplace add specnaut/specnaut-marketplace`<br/>`copilot plugin install specnaut-plugin@specnaut-marketplace` |

The skill content is identical across harnesses; only the surface conventions differ (slash-command
prefix, how a skill activates, tool naming). One rule is harness-specific and lives in the
scaffolded `AGENTS.md`: dispatch a Specnaut agent by its name, never by describing the task —
`Task(subagent_type: "<name>")` on Claude Code, `spawn_agent(agent_type="<name>")` on Codex.

#### Claude Code — slash-command prefix

```
/specnaut-plugin:task plan "<feature description>"
/specnaut-plugin:task implement
```

Slightly verbose, but unambiguous (the plugin's slash-commands are namespaced under
`specnaut-plugin`, and the pipeline lives in the `task` skill). If you scaffold project-local with
`specnaut init` instead, you get the shorter `/task plan "..."` form.

To test a local checkout of the plugin without publishing:

```bash
claude --plugin-dir /path/to/specnaut/plugin
```

#### Auto-activation across harnesses

Each skill carries a `description` the harness matches against what you type, so "plan this issue"
or "review my work" is enough for the right skill to fire without invoking `/task` explicitly.
Nothing is injected at session start. On OpenCode, `.opencode/plugins/specnaut.js` only adds the
plugin's skills directory to OpenCode's skill search path.

#### Notes on Codex CLI and the shared marketplace

Codex CLI and Copilot CLI distribute plugins through marketplaces. Specnaut has two adapter targets
that need a one-time human setup before the marketplace listings are live:

- **Codex CLI** — `.codex-plugin/plugin.json` ships in the specnaut-cli repository, and Codex
  installs directly from it.
- **Claude Code + Copilot CLI marketplace** — the catalogs live in specnaut-cli under
  `packaging/marketplace/`, one per installer dialect (`.claude-plugin/marketplace.json` for Claude
  Code, `.github/plugin/marketplace.json` for Copilot CLI). Every release pins their entries to its
  own tag, and `specnaut/specnaut-marketplace` copies them verbatim from the latest release.

**Plugin vs `specnaut init`** — they complement each other:

| Aspect                               | Binary (`specnaut init`)   | Plugin (`/plugin install`)          |
| ------------------------------------ | -------------------------- | ----------------------------------- |
| Scope                                | Project-local (`.claude/`) | User-scope (all projects)           |
| Slash-command style                  | `/task plan` (short)       | `/specnaut-plugin:task plan`        |
| Customizable per-project             | Yes                        | No (user-scope, shared)             |
| Backlog scripts, hooks, `.specnaut/` | Yes                        | No (project-stateful — binary-only) |
| Kept in sync                         | `specnaut upgrade`         | `/plugin update`                    |

Most teams use both: the plugin provides discoverability and keeps the agents up-to-date across all
projects; `specnaut init` provides the short slash-commands and project-local customization.

## Quickstart

### Create a new project

```bash
specnaut init my-project
cd my-project
```

This scaffolds a tree configured for the **Claude Code** harness by default (`.claude/`,
`.specnaut/`, `AGENTS.md`, `.specnaut/backlog.md`, …). Open the project in your harness — that's
where you'll run the rest.

### The three top-level skills

Specnaut gives your harness three skills, and the split between them is the model:

| Skill           | Owns                                                                   | Example                                                      |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| **`/task`**     | one unit of work — from backlog item to merged branch, audits included | `/task add "…"`, `/task plan <id>`, `/task audit --security` |
| **`/specnaut`** | the framework itself — its documentation, what is installed, upgrading | `/specnaut doc`, `/specnaut list`, `/specnaut upgrade`       |
| **`/ship`**     | going to production — versioning and release notes                     | `/ship tag`, `/ship release`                                 |

Carry the work from backlog to merge, keep the framework current, ship it.

`/task` covers the whole life of one unit of work: the backlog verbs (`list`, `next`, `add`, `edit`,
`close`, `groom`, `estimate`, `status`, `brief`, `<id>`), the pipeline (`plan`, `implement`,
`review`, `merge`), the read-only audit (`/task audit`, every applicable axis with no flag, or
`--security`, `--archi`, `--perf`, `--a11y`, `--deps`), and `constitution`. On harnesses that prefix
their skills, it is `specnaut-task`; `specnaut init` prints the exact commands for the harness you
chose.

Neither `/task` nor `/specnaut` carries a release concern. Tagging and release notes used to sit
under `/specnaut` as the `tag-version` and `release-version` phases; they are now `/ship tag` and
`/ship release`. Both the owner and the verb changed, so `/ship tag-version` is not a command — see
[Ship: versioning and release notes](#ship-versioning-and-release-notes).

> **Moved in 7.2.** `/board …` is now `/task …` (`/board update` is `/task edit`); `/specnaut plan`,
> `tasks`, `implement`, `review`, `merge` and `constitution` are now `/task plan`, …; `/code-audit`
> is `/task audit`, and `/sec-audit`, `/arch-audit`, `/perf-audit`, `/a11y-audit` and `/dep-audit`
> are `/task audit --security`, `--archi`, `--perf`, `--a11y` and `--deps`. The old addresses print
> the new one and stop; there are no aliases. See
> [`UPGRADING.md`](https://github.com/specnaut/specnaut-cli/blob/main/UPGRADING.md) in the CLI
> repository for what `specnaut upgrade` moves for you.

> **Changed in 7.3.** `tasks` is part of `implement`: `/task tasks` prints `/task implement` and
> stops. The constitution lives at `docs/constitution.md`, the roster is nine agents, and
> `merge: manual` holds harder — see [Changed in 7.3](#changed-in-73).

### The constitution: `docs/constitution.md`

`specnaut init` bootstraps your project's constitution at `docs/constitution.md`: four short
principles — **domain isolation**, **dependencies point inward**, **bounded contexts** and **SOLID**
— each with a `Check:` line a reviewer can apply to a plan or a diff, and an `Override:` line naming
what to adapt to your stack. Every `/task` entry point and every bundled agent reads it before
anything else, and the plan cites, by name, each principle the change could break.

It is a team document, not Specnaut's: once it exists, no `init` or `upgrade` rewrites it, with or
without `--force`. Amend it with `/task constitution` when you need to — it is not a step to run
before your first plan. An amendment is drafted, shown to you as a diff with its `Version:` bump
(semantic versioning), and written only after you reply with the exact confirmation phrase it
prints; a hook refuses any other write to the file. It is loaded into every session, so it keeps
principles only — delivery status and incident history belong in the backlog — and it has the
shortest size limits of any file.

**If you publish `docs/` as a site**, the constitution is published with it: exclude
`docs/constitution.md` if it must stay private.

**Size limits.** Thresholds live in `.specnaut/size-limits.yml`, which your project owns; the
defaults in `.specnaut/memory/size-limits.md` (file 300 / 500 lines, function 30 / 50, constitution
60 / 100) apply to any unit it does not set, and no agent carries its own number. Three rules: a
unit over its ceiling fails unless the change shrinks it; a unit over its target may not grow past
its size where the change began; extract before you add. The plan lists the size ratchet among its
done checks; the developer extracts an over-target file first, as its own commit, and reports
`file: before → after`; review measures every diff. For edits that never go through an agent,
`.specnaut/scripts/bash/size-ratchet.sh` checks the staged changes against the branch's merge base
(or `--since <ref>`) and exits non-zero on a violation — so an extraction commit followed by an
addition passes — run it by hand or from your pre-commit runner; Specnaut installs no git hook.
`/task constitution` also changes the gate configs (`.specnaut/size-limits.yml`,
`.specnaut/boundaries.yml`, `.specnaut/ui.yml`), under a confirmation phrase of their own.

Refine the root `AGENTS.md` for your stack, then run `/task plan "<feature description>"` for your
first feature.

### Add Specnaut to an existing project

```bash
cd my-existing-project
specnaut init --here
```

Specnaut merges its `.gitignore` block into your existing file (non-destructively, fenced with
`# --- Specnaut: gitignore ---` markers). Other specnaut-managed files use upgrade-aware semantics:
if you customize a generated file, `specnaut upgrade` will preserve it unless you pass `--force`.

**Declaring a file preserved across a forced refresh.** `specnaut upgrade` auto-preserves a file
whose hash diverged, but `specnaut init --force` would otherwise overwrite every managed file. To
keep a customized file (e.g. a tailored `.claude/agents/product-owner.md`) even through a forced
refresh, list it in a version-controllable `.specnaut/preserve.yml` manifest:

```yaml
preserved:
  - .claude/agents/product-owner.md
```

Both `init --force` and `upgrade` then leave that file untouched and print one notice per preserved
path — never a silent skip. The file stays lock-tracked, so `specnaut diff` keeps showing how it has
drifted from the evolving bundle. A project with no `preserve.yml` behaves exactly as before. To
deliberately discard a customization and restore the bundled version for one run, add
`--reset-preserved` (it overrides every declaration for that run and reports each override; it is
never the default). A declared path Specnaut does not manage — neither shipped by the bundle nor
recorded in the lock — is reported as an ineffective declaration (a warning) rather than silently
honored. A declared path the bundle has since dropped stays on disk and tracked, and every `upgrade`
reports that upstream no longer ships it until the declaration is removed.

Pass `--dry-run` to preview the plan without touching disk — combined with `--force` it shows which
files would be overwritten and which would be merged, but writes nothing. `--dry-run` is the trump
card: it wins over `--force`.

**Inside a monorepo workspace?** When the target sits inside an enclosing Specnaut workspace,
`specnaut init` and `specnaut upgrade` provision `.specnaut/` as usual but skip the agentic files
(`.claude/skills`, `.claude/agents`, `.claude/commands`) — those are inherited from the parent, so
no copy is scattered into the sub-repo.

A target counts as parent-managed when an ancestor has `.specnaut/` **and** either:

- that ancestor's `deno.json` `workspace` list declares the target as a member, or
- the target carries an empty `.specnaut/parent-managed.yml` marker.

The second exists because the first is a Deno-specific signal. A sub-repo on a different toolchain
is usually kept out of `workspace` deliberately — adding it there breaks its own build — and before
the marker it had no way to say "my enclosing workspace manages me". The marker does not skip the
ancestor check: without a providing ancestor, suppressing the agentic files would leave the sub-repo
with none and nothing supplying them.

To force full provisioning anyway, drop an empty `.specnaut/standalone.yml` marker in the target. It
wins over both signals above.

### What's in `.specnaut/installed.lock` and should I commit it?

`specnaut init` writes a small YAML file at `.specnaut/installed.lock`. It records the harness you
chose, the templates version installed, and a SHA-256 + install timestamp for every file Specnaut
emitted. It contains no secrets — only file paths, content hashes, and version strings.

**Commit it.** `specnaut upgrade` reads this lock to know which harness to map templates to, to
detect files you have customized (so it doesn't clobber them), and to drop orphaned files that are
no longer part of the bundle. `specnaut check --project` also surfaces the harness, templates
version, and backlog backend from this file (and warns when `backlog-config.yml` has empty required
fields for the github / gitlab backends). Without the lock, both commands degrade gracefully but
cannot do their real job — `specnaut upgrade` will refuse and ask you to re-run
`specnaut init --here --force` to rebuild the lock from scratch.

### Pick a different harness

```bash
specnaut init my-project --ai cursor
specnaut init my-project --ai antigravity
specnaut init my-project --ai codex
# … etc.
```

Six harness targets are supported: `claude` (default), `cursor`, `codex`, `copilot`, `opencode`,
`antigravity`. Windsurf was supported up to 5.5.0 and removed in 6.0.0 — a Windsurf project switches
with `specnaut init --here --force --ai <harness>`. Each emits files in the convention that harness
expects.

### Pick a backlog backend

```bash
specnaut init my-project --backlog github
specnaut init my-project --backlog gitlab
specnaut init my-project --backlog local      # default
specnaut init my-project --backlog cloud      # hosted Specnaut Cloud
```

Four backends are supported: `local` (default), `github`, `gitlab`, and `cloud` — the hosted
[Specnaut Cloud](https://app.specnaut.com) backend, which you connect to with `specnaut login` (see
[Connect the CLI to Specnaut Cloud](#connect-the-cli-to-specnaut-cloud) below). See
[Backlog as product source of truth](#4-backlog-as-product-source-of-truth) for what each one stores
and how the PO agent talks to it.

#### Pre-fill the backlog config with `--backlog-url`

When the chosen backend is `github` or `gitlab`, `specnaut init` can take the project's Kanban URL
up front and write a fully-populated `.specnaut/backlog-config.yml` — no manual edit needed before
running `/task`. Pass the project URL via `--backlog-url`:

```bash
# GitHub org-owned project
specnaut init --here --ai claude --backlog github \
  --backlog-url https://github.com/orgs/myorg/projects/1

# GitHub user-owned project
specnaut init --here --ai claude --backlog github \
  --backlog-url https://github.com/users/alice/projects/12

# GitLab (gitlab.com or self-hosted)
specnaut init --here --ai claude --backlog gitlab \
  --backlog-url https://gitlab.com/mygroup/myproject
```

Three URL formats are supported:

- GitHub org-owned: `https://github.com/orgs/<org>/projects/<N>`
- GitHub user-owned: `https://github.com/users/<user>/projects/<N>`
- GitLab project: `https://<host>/<group>/<project>`

For GitHub, the `repo:` field of the populated config is derived from `git remote get-url origin`
(both HTTPS and SSH remote shapes are recognised). Pass `--backlog-repo <owner>/<name>` to override
that derivation when the project lives across multiple repos or the local remote isn't `origin`.

Without `--backlog-url` on a TTY, `specnaut init` interactively prompts for the URL after the
backend picker. **In non-TTY mode (CI / scripted setup) `--backlog-url` is required when `--backlog`
is `github` or `gitlab`** — omitting it exits with code `2` and a clear error message. The
non-clobber invariant still holds: re-running `init` against a project with an existing
`backlog-config.yml` does NOT overwrite it.

### Connect the CLI to Specnaut Cloud

[Specnaut Cloud](https://app.specnaut.com) is the optional **hosted backlog + remote-control
backend**. To drive a project's backlog from the CLI against your Cloud account, scaffold with the
`cloud` backend and then authenticate the machine — **`specnaut login`** is the one command to run:

```bash
specnaut init my-project --backlog cloud   # scaffold against the cloud backend
specnaut login                             # authenticate this machine (alias for `specnaut cloud login`)
```

`specnaut login` runs a **browser device-authorization flow** (like `gh auth login`): it prints a
one-time code + verification URL, opens your browser, waits for you to approve, then stores an
access

- refresh token securely and links the project to a Cloud project. Credentials go to the **OS
  keychain** when a keyring is reachable, otherwise a `0600` file at `~/.specnaut/credentials.json`;
  they are keyed by deployment URL, so one machine can hold tokens for several deployments.

Before opening the browser, login **prints the target server and where the URL came from**, and asks
for confirmation the first time you authenticate against a URL that came from a project's
`.specnaut/backlog-config.yml` — a safeguard so a cloned repo cannot silently redirect your login:

```
Connecting to:  https://your-deployment.convex.site
Source:         project config (.specnaut/backlog-config.yml)
```

Once connected, the Cloud CLI commands are:

```bash
specnaut login                 # authenticate this machine (alias for `specnaut cloud login`)
specnaut cloud login           # authenticate + (re)select the linked project
specnaut cloud orgs            # list the organizations your account belongs to
specnaut cloud board           # show the linked project's board (tasks grouped by column)
specnaut cloud token           # print a fresh access token to stdout (for scripts)
specnaut cloud logout          # remove the stored credentials for the deployment
```

Add `--api-url <url>` to any of these to target a specific deployment. **Headless / CI:** set the
`SPECNAUT_CLOUD_TOKEN` environment variable to a Cloud API token to skip the browser flow entirely —
no keychain access is attempted, which is the supported path for CI and unattended VMs.

### Run `init` non-interactively (CI / scripts)

When you pass both `--ai` and `--backlog` (and `--backlog-url` when the backend is remote), no
interactive prompt is shown — `specnaut init` runs fully unattended, which is what you want in CI or
scripted setup:

```bash
# Local backend — zero-config, just the two flags
specnaut init my-project --ai claude --backlog local

# GitHub backend — --backlog-url is required in non-TTY mode
specnaut init my-project --ai claude --backlog github \
  --backlog-url https://github.com/orgs/myorg/projects/1

# GitLab backend — same shape
specnaut init --here --no-git --ai cursor --backlog gitlab \
  --backlog-url https://gitlab.com/mygroup/myproject
```

Without those flags, `specnaut init` shows an arrow-key picker (↑/↓ to move, space/enter to select)
when stdin is a TTY, and falls back to a numeric prompt — or the defaults — when stdin is piped.

### Pick a versioning scheme

`specnaut init` asks which scheme to use for the bundled `/ship tag` and `/ship release` commands.
Two options:

- **SemVer** (`v1.2.3`) — recommended for libraries / SDKs whose consumers reason about breaking
  changes by version number.
- **Date-based** (`vYY.M.Da`) — recommended for apps / SaaS / deployed products where the version
  number is just a release identifier. No major/minor/patch guesswork; the letter suffix handles
  same-day re-tags.

Specnaut pre-selects a sensible default by scanning the project for SemVer signals:

- **Library publishing markers** — `package.json` `exports`, `pyproject.toml` `[project]` /
  `[tool.poetry]`, `Cargo.toml` `[lib]`, `composer.json` `type=library`.
- **Semver-shaped git tags** — any local tag matching `v?MAJOR.MINOR.PATCH` (with optional
  pre-release / build suffix), e.g. `v1.2.3`, `1.0.0-rc.1`, `v2.0.0+build.5`. Date-shaped tags like
  `v25.5.16a` are explicitly excluded so brownfield repos already on date scheme don't get
  mis-suggested.
- **CHANGELOG.md** — Keep-a-Changelog style headers (`## [1.2.0]`, `## v1.2.0`, `## 1.2.0`).

Any one signal flips the suggestion to SemVer. When zero signals are found, Specnaut suggests
date-based. The user can always override at the picker. The choice is persisted by **rewriting the
scaffolded skill** itself (the unchosen scheme's blocks are stripped at scaffold time), so the
on-disk `.specnaut/scripts/release/tag.sh` only contains the chosen scheme's logic. To switch
schemes later, re-run `specnaut init` and pick the other option.

Pass `--scheme semver|date` to bypass the picker in non-TTY mode.

### Other commands

```bash
specnaut check                    # diagnose your environment
specnaut check --project          # also diagnose the current specnaut project
                                  #   (warns if the plugin was uninstalled after migration)
specnaut upgrade                  # update templates to the binary's version
                                  #   (when specnaut-plugin is installed + harness=claude:
                                  #    vanilla agent/command files are auto-migrated to the plugin)
specnaut upgrade --dry-run        # preview the upgrade plan
specnaut upgrade --force          # apply destructive changes (backs up customizations)
specnaut upgrade --reset-preserved  # ignore .specnaut/preserve.yml for this run (reports each override)
specnaut diff                     # show how managed files diverge from the bundle (read-only)
specnaut diff --only-customised   # restrict the diff to files you actually changed
specnaut init --here --force --reset-preserved  # forced refresh that overrides preserve declarations
specnaut reconcile --status       # list files pending post-upgrade reconciliation (JSON)
specnaut reconcile <path> --accept-upstream  # take new template version (backs up local)
specnaut reconcile <path> --accept-current   # keep local version (re-stamps lock SHA)
specnaut login                    # connect the CLI to Specnaut Cloud (see "Connect the CLI to Specnaut Cloud")
specnaut cloud orgs               # list your Cloud organizations
specnaut cloud board              # show the linked project's board
specnaut cloud token              # print a fresh Cloud access token (for scripts)
specnaut cloud logout             # clear stored Cloud credentials
specnaut self-update              # upgrade the binary itself
specnaut self-update --check      # only report whether an update is available
specnaut --version                # print version
specnaut --help                   # full usage
```

From inside an agent session, `/specnaut upgrade` runs the same round for you. It updates the binary
when a newer release is published, then runs `specnaut upgrade` and reports what it rewrote, what it
kept as customised, and what waits for `specnaut reconcile`. It checks the project with
`specnaut check --project`, then commits the result as `chore(specnaut): upgrade to v<version>`
without pushing. `--dry-run` shows the plan and changes nothing, and `--no-self-update` keeps the
installed binary. It never runs `--force` unless you ask for it.

### Ship: versioning and release notes

Every scaffolded project ships `/ship`, the third top-level skill. It owns going to production, and
it is the only place release lives:

- **`/ship tag`** — creates an annotated git tag using the project's versioning scheme. Bumps
  automatically (latest tag → next). For SemVer, `--bump major|minor|patch` controls the direction
  (default `patch`); for date-based, the letter suffix increments. Pushes to `origin` if a remote is
  configured, else stays local. Pass `--no-push` to skip.
- **`/ship release`** — generates **categorized release notes** for a tag (default: latest) covering
  every commit since the previous tag. The output is the release-body Markdown, one section per
  non-empty Conventional Commits bucket (Features / Bug Fixes / Performance / Refactors /
  Documentation / Tests / Build & CI / Chores / Style / Other). Pipe the output into
  `gh release create` / `glab release create` to publish.

**If you are coming from an earlier version**, these were `/specnaut tag-version` and
`/specnaut release-version`. Both halves of the name changed — the owning skill _and_ the verb — so
swapping only the prefix gives you `/ship tag-version`, which nothing answers to. The new names are
`/ship tag` and `/ship release`.

Projects scaffolded before the split get `/ship` by running `specnaut upgrade`; there is nothing to
move by hand, and a customised phase document travels to its new address rather than being left
behind at the old one. **The scripts do not move**: they stay at
`.specnaut/scripts/release/{tag,release}.sh`, the same path across every harness, so anything of
yours that calls them directly keeps working.

For **GitHub**-hosted projects, the bundled `release-github.sh` wrapper is the one-command path:

```bash
bash .specnaut/scripts/release/release-github.sh           # latest tag, auto-baseline, publish
bash .specnaut/scripts/release/release-github.sh --draft   # create as draft
```

For **GitLab**-hosted projects, `release-gitlab.sh` mirrors the same contract:

```bash
bash .specnaut/scripts/release/release-gitlab.sh           # latest tag
bash .specnaut/scripts/release/release-gitlab.sh v1.2.3    # specific tag
```

Both wrappers compute the baseline as **the previous tag with a published release attached** (not
the previous tag by date) — tags pushed without a release are "subsumed" and their commits land in
this release, with the subsumed tag names listed inline. They push the tag to `origin` if needed,
then call `gh release create` / `glab release create`. Idempotent: a second run against an
already-released tag exits 0 with an explanatory message.

For **local-only** projects (no remote, or you just want a Markdown artifact), the bundled
`release-local.sh` wrapper writes the categorized body to a file:

```bash
bash .specnaut/scripts/release/release-local.sh             # latest tag → RELEASE_NOTES_<tag>.md
bash .specnaut/scripts/release/release-local.sh --out NOTES.md v1.2.3
```

No remote API calls, no auth — paste the output into any release UI, attach to a deploy email, or
pipe to a custom publisher.

## Available harnesses

| Key           | Display name       | Output root             |
| ------------- | ------------------ | ----------------------- |
| `claude`      | Claude Code        | `.claude/`              |
| `cursor`      | Cursor             | `.cursor/`              |
| `codex`       | Codex CLI          | `.codex/`, `.agents/`   |
| `copilot`     | GitHub Copilot CLI | `.github/instructions/` |
| `opencode`    | OpenCode           | `.opencode/`            |
| `antigravity` | Antigravity        | `.agents/`              |

All harnesses share the same source-of-truth content in `templates/core/`. The per-harness adapters
in `src/infrastructure/harness/` map that core bundle to each harness's directory layout and
frontmatter conventions.

Some harnesses also ship harness-specific helper files alongside the core scaffold:

- **Claude** — `.claude/CLAUDE.md`, a relative symlink to the root `AGENTS.md` (a one-line
  `@../AGENTS.md` file where links are refused), so Claude Code loads the same file as every other
  harness. Plus `.claude/loop.md`, the default prompt for `/loop`, Claude's recurring
  periodic-maintenance feature.
- **Codex** — `.codex/AGENTS.md`, a relative symlink to the root `AGENTS.md` (Codex reads the root
  file itself), and `[agents] enabled = true` in `.codex/config.toml`, so Codex starts Specnaut's
  agents by name. `.codex/goal.md` is no longer shipped: `/goal` never read it.

The harness features that pair well with the workflow — `/loop`, `/goal`, `claude agents`, headless
runs and MCP servers on Claude Code; `/goal` and the CLI reference on Codex — are documented in the
bundled `specnaut-facts` skill, in `integrations.md`
(`.claude/skills/specnaut-facts/integrations.md` on Claude Code,
`.agents/skills/specnaut-facts/integrations.md` on Codex). The root `AGENTS.md` keeps one line in
its `Optional integrations` section pointing there, so the reference is read when asked rather than
loaded into every session.

### Interoperating with DeepSeek Harness

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) has no `--ai` key, and
Specnaut ships no adapter for it. It does not need one: run **`specnaut init --ai codex`**, and a
`dsh` session reads the result as it stands. Both surfaces `dsh` discovers inside a project are ones
the Codex target already writes:

- **Instructions** — `AGENTS.md` and `CLAUDE.md`, found by walking up from the session's working
  directory to the nearest `.git` ancestor. That is `dsh`'s `agent-instructions` plugin, whose
  `projectRootMarkers` default to `['.git']`.
- **Skills** — `<projectRoot>/.agents/skills/<name>/SKILL.md`. `dsh`'s filesystem skill provider
  resolves `<projectRoot>/.dsh/skills` at rank 100 and `<projectRoot>/.agents/skills` at rank 200,
  parsing single-level `<name>/SKILL.md` bundles with a kebab-case name and YAML frontmatter
  carrying `name` and `description` — which is what the Codex target emits.

**Where it stops.** `dsh` does not discover `.agents/agents/*.md` or `.agents/workflows/*.md`. Its
subagents are programmatic providers registered on `ctx.subagents` in the plugin tree, not markdown
found on disk. Specnaut's agent fleet does not cross over; skills and instructions do.

Read this as interoperation by convention rather than as a supported harness. The compatibility is
incidental — it follows from `.agents/` having become a convention shared across vendors, not from
an integration Specnaut maintains or tests against a real `dsh` install. `dsh` is itself in
developer preview, and its README warns of compatibility-breaking changes, so this note can go stale
without anything here changing.

## What makes Specnaut different from upstream Spec Kit

Specnaut is a fork of the official `specify` CLI with the following additions:

### 1. Auto-chained pipeline

The generated `/task` skill chains `plan → implement → review → merge` in a single session. Upstream
stops at every step and asks the human to invoke the next one.

```
/task plan "<feature description>"
```

That one command carries you to a merged, pushed base branch. When the idea is still fuzzy and you
cannot yet write that one-line description, say so anyway — `plan` opens with a short discovery
dialogue (one question at a time, 2–3 genuinely different shapes) and then writes the plan in the
same turn. There is no separate step to remember.

#### Autopilot by default: one stop, at the plan

- **STOP 1 — the end of `plan`, only when something only you can answer is open.** That means
  business rules, thresholds, what happens to existing data, scope — and always the base branch,
  anything irreversible or destructive, a break in a public surface, a new external service, vendor
  or cost. Technical forks are not on the list: architecture, patterns, security hardening and
  performance trade-offs are ranked by the expert seats, and the plan takes the top option and
  records what it rejected and why. At the stop you see that design _as a report, not a vote_, both
  audits' findings separately, and the open questions, the one that invalidates the most others
  first. With nothing open, `plan` reports the same and goes straight on to `implement`.

After your answers the chain runs to the end without asking again: implementation, review, then a
local fast-forward merge into the base branch, a **push**, and the backlog item closed. It still
halts — and says why — on a real blocker: a CRITICAL or HIGH finding it could not fix, a merge that
cannot fast-forward, a push the remote refuses.

Only a **CRITICAL or HIGH** finding buys another fix cycle; MEDIUM and LOW go to the backlog and the
branch ships. Those cycles run before the merge without asking you again between each one.

#### Keeping a human on the merge

When someone must read every change before it lands, set it once in `.specnaut/workflow.yml`
(scaffolded by `specnaut init`):

```yaml
merge: manual
```

The chain then stops a second time, at the **review verdict**: the summary (files changed, tests,
open risks, business outcome) and `Ready to merge? Reply merge to land it` are the same moment, and
that one word covers the merge, the push and the close. For a single run, `--manual-merge` or "stop
before merging" in your request does the same. A value that cannot be read (a typo) counts as
`manual`, so a broken setting never pushes.

**The hold is enforced, not only asked for.** Under `merge: manual` in the file, a hook holds every
merge into, and push of, the base branch until your own prompt in that turn says `merge` or
`/task merge`. A plain "yes", a `merge` from an earlier turn, a click on a permission prompt, or an
edit to `workflow.yml` or to the landing scripts does not release it. `land-feature.sh` and
`remove-spec.sh` also hold themselves (exit 13, naming what releases them), so a renamed copy or
another spelling of the command is held too. After a `cd` into another project, the hold reads that
project's mode as well as yours, and keeps the stricter one.

`/task merge --pr` delivers through a pull request instead of a local merge in either mode.

#### One planning document, and what makes it binding

A feature produces one file: `plan.md`. There is no `spec.md`, `tasks.md`, `research.md`,
`data-model.md`, `quickstart.md` or `contracts/` — every extra document was another chance for two
of them to disagree, and the disagreement was always found by whoever was implementing. `implement`
orders the work itself, from the plan: there is no separate breakdown step.

By default `plan.md` is a **brief** in five parts: the task and what is out of scope; the guardrails
(the decision table, the constitution principles the change could break, the surfaces it touches,
and a required `Surfaces added or widened` line); done, as runnable checks; the audit findings; and
the open questions with their answers. The **full plan** — scenarios, `FR-` / `SC-` ids, domain
model, risks — is written when you pass `--full`, or without being asked when the change adds or
widens a trust boundary: stored data or a migration, authentication or authorisation, secrets or
cryptography, a new place that accepts untrusted input, a new external service or dependency.

Either shape carries the **decision table**, the part the phase exists for:

| The decision            | Its single home               | What would duplicate it            |
| :---------------------- | :---------------------------- | :--------------------------------- |
| the rule, in your words | one file path — never a layer | the shapes a second spelling takes |

Every requirement that is a rule gets a row. The third column is the one a reviewer greps for, and
writing it is what makes you notice that a schema constraint and an application check are two
spellings of one rule. **The table is binding on the implementer**: a decision may not move out of
its home without the plan being amended first, so a review finding that a decision has two homes is
a plan violation rather than a style opinion.

#### The plan is audited before a line of code exists

`plan` dispatches the `architect-expert` and `security-expert` agents **on the plan itself** — and
`performance-expert` too when the change has a hot path, a bulk job or a query over an unbounded set
— in the same message so they run concurrently, whether the plan is a brief or the full plan. They
judge different things: the architect asks whether a rule has one home, the security seat asks
whether that home is reachable by someone who should not reach it.

Their findings go **into `plan.md`** — either the plan changes, or it records why the objection was
accepted. A clean verdict is written down _with its coverage_, because a clean verdict is worth
exactly what it covered.

This is what replaced the old cross-artefact consistency check. With one document there are no
artefacts left to hold in agreement, and the trade is a good one: architecture found at review time
is architecture rebuilt, whereas a plan-time finding costs an edit. Security findings are the most
expensive class to fix late — a missing authorization gate is one line, but a data model that made
the gate impossible is a migration, a backfill and every caller.

#### Linking a feature to a backlog issue

Pass `--issue <id>` to `/task plan` (or to the bundled `create-new-feature.sh`) to record the
originating backlog issue in `.specnaut/feature.json` and move its card to In progress:

```
/task plan "Fix the off-by-one in pagination" --issue 42
```

`/task merge` closes it once the work is pushed, without asking: the push was the authorisation. The
phase is a sequence of bundled scripts, each with a documented exit table the agent maps line by
line:

- `epic-status.sh` reads the branch's `Epic:` trailers and tells a standalone feature (squashed by
  scope) from an epic (one commit per child, kept);
- on an epic, `fold-fixups.sh` folds each `fixup!` commit into its own child's commit, so the base
  still reads one commit per child;
- `land-feature.sh` checks the tree is clean and the branch contains `origin/<base>`, fast-forwards
  the base, pushes it, deletes the branch and verifies `HEAD` is the base;
- `cascade-check.sh` (github / gitlab) refuses the close while a sub-issue is still open; the
  `product-owner` agent then posts a close comment naming the merged range and closes the issue;
- `close-shipped.sh` confirms each issue is closed, moves its card to Done, and reconciles the whole
  board once;
- `remove-spec.sh` removes the feature's spec directory and pushes the removal.

The board stays in sync with `main` instead of drifting. `--no-close` merges and pushes but leaves
the item open, for a feature delivered across several branches. `--issue` is opt-in; feature trees
without the field skip the close.

#### Running a single phase

`--manual` is the only chain flag:

```
/task plan --manual "<feature description>"
```

#### Mid-chain re-entry needs no flag

Any phase can enter the chain when invoked mid-flow — useful after a long session or a fresh shell.
The behaviour is **inferred from what is on disk**: if the downstream artefacts under
`.specnaut/specs/<feature>/` are missing, the chain fires; if they exist, the invocation is a
single-phase re-run, so regenerating `plan.md` does not accidentally cascade through the rest.

```
/task implement N     # picks up the tail: → review → merge → push
```

### 2. `review` phase post-implement

After `implement`, the generated workflow runs a dedicated `review` phase on a frozen tree. It
measures first — the quality gates (format, lint, typecheck, tests) and the size ratchet — then
dispatches the review seats **from your main session**, by name, at most four at a time:
`code-reviewer` always (with its test checklist when tests changed), `security-expert` always,
`accessibility-expert` when the diff touches a front-end surface, `dependency-expert` when it
touches a dependency manifest, and `performance-expert` when the plan recorded a hot path. No
coordinating agent sits in between. Only a CRITICAL or HIGH finding sends the work back — the loop
is `implement → review → fix → re-review`, also automatic — while MEDIUM and LOW go to the backlog
and the branch ships.

### 3. Developer agent doctrine

Every scaffold ships a `developer` agent that implements a planned feature from its `plan.md` — the
brief or the full plan — and fixes review feedback. It is started by name, never auto-invoked, and
its doctrine applies to every task, regardless of project stack:

**Plan and constitution first** — it reads `docs/constitution.md`, noting each principle's `Check:`
line, then the plan: its guardrails say what must not break, its done checks are what it works on
until they pass, and its decision table gives every rule one home file that it may not spell a
second time without the plan being amended. The domain model is wherever the plan states it, or in
the Product Owner's `/task brief` output on the direct path; where the change introduces entities
and none of these names them, the developer says so in its report and models them from the code that
exists.

**Test-Driven Development (NON-NEGOTIABLE)** — red → green → refactor on every implementation. No
business logic ships untested. If the project has no test infrastructure, the developer bootstraps
the language-idiomatic test runner (Vitest for TS/JS, Pytest for Python, JUnit for Java, `go test`
for Go, `cargo test` for Rust, PHPUnit for PHP, RSpec for Ruby, etc.) as part of the task and
records it explicitly in the `Decisions` block of the completion report.

**Domain-Driven Design (NON-NEGOTIABLE)** — every change respects the project's domain boundaries;
the layers and their dependency direction are the constitution's. Domain layer stays pure (no I/O,
no framework). Application layer holds use cases and ports. Infrastructure layer holds adapters.
Presentation talks only to use cases. Cross-bounded-context bleed-through is forbidden — split or
use an anti-corruption layer.

**Boy Scout Rule — fix it, do not log it** — a repair inside what the task already touches is done
in the same branch, with a test that fails without it, and noted in `Decisions`, whatever its size.
Only four reasons justify logging instead: it needs a product decision, crosses a boundary the task
does not touch, needs a migration, or is larger than the task itself. Those go in a
`Tech debt surfaced` block, one sentence each saying why, and the Product Owner opens each at P0 or
P1 — anything that clears that bar is significant by definition.

**SOLID / DRY / KISS / YAGNI** — explicitly required. Framework-specific patterns (Repository, DI,
React hooks, MVC controllers) come from the constitution, never from habit. **No silent catches** —
every `catch` either logs at ERROR/WARN or re-throws. **In-code documentation** — doc-comments on
every function, method, or class encoding a business rule or non-obvious design decision, in the
idiomatic format for the language.

### 4. Backlog as product source of truth

A Product Owner agent gates every mutation, and supports three backends:

- **Local Markdown** (`--backlog local`, default) — index at `.specnaut/backlog.md`, task files at
  `.specnaut/backlog/NNN-slug.md` (typed frontmatter: id, title, category, priority, complexity,
  status, parent, depends_on, spec, tags, created). Sub-tasks reference their parent via
  `parent: "#NNN"`.
- **GitHub Issues + Projects** (`--backlog github`) — the agent talks directly to the backend via
  `gh` CLI; epics use the native sub-issues API. Read paths use
  `gh issue list/view --json
  projectItems` (REST-ish CLI projection of Project V2 fields, ~1–2
  GraphQL points per call), and raw `gh api graphql` is reserved for the one operation with no CLI
  equivalent (`gh project
  item-edit`'s underlying `updateProjectV2ItemFieldValue` mutation). Keeps
  backlog grooming under the shared 5,000-points-per-hour GitHub API quota. No local mirror, no sync
  command — the remote is the source of truth.
- **GitLab Issues** (`--backlog gitlab`) — the agent talks to GitLab via `glab` CLI. Status is
  tracked via scoped `Status::*` labels rather than a native column field; sub-tasks use a
  `parent::#NNN` scoped label (Free-tier compatible — native GitLab Epics are Premium-only).
  Otherwise the model mirrors the GitHub backend (no local mirror, no sync command).

The user picks one backend per project. The chosen backend is recorded in `.specnaut/installed.lock`
so the PO knows which one to use without auto-detection.

**Semantic label bootstrap.** For GitHub and GitLab backends, `specnaut init` scaffolds
`.specnaut/scripts/backlog/ensure-labels.sh`. Run it once to seed seven canonical labels —
`security`, `refactor`, `docs`, `tech-debt`, `dx`, `performance`, `dependency` — into the remote
repo. Idempotent; never edits or deletes existing labels. The GitHub default `bug` label is verified
but never re-created. The full reference lives in `.specnaut/LABELS.md` next to the install —
including a guidance note for local backend users on tagging via task-file frontmatter.

**Grooming ends with a promotion.** `/task groom` moves each groomed item from the board's intake
column to its ready column (default `Backlog` → `Ready`), so the next run skips it by column alone;
only open scope decisions keep an item in intake. On GitHub the columns are read from the board once
per run (`groom-columns.sh`). When the board has no matching column, the run asks once — an existing
column, add the missing one, or groom without promoting — and records the answer in
`.specnaut/backlog-config.yml` (`intake_column` / `ready_column`), so it is never asked again. A
move that fails is listed in the groom report.

**Mandatory classification — every groomed item is sized, prioritised, typed, and labelled.** The PO
classifies every item it creates or clarifies along four axes — Size, Priority, Issue Type (`Task` /
`Bug` / `Feature`), and at least one label — before the item is done; classification is a gate, not
optional polish. On a GitHub project with native `Priority` / `Size` single-select fields and native
Issue Types, the bundled
`.specnaut/scripts/backlog/set-field.sh <issue> <Priority|Size|IssueType> <value>` writes each to
its native field or type — and the PO **never** also applies a `priority:*` / `size:*` / `type:*`
label on an item that already carries the native value. Labels are a strict fallback for projects or
orgs without the native field/type; they are not a peer signal. `set-field.sh` exit codes tell the
caller which path applies: `0` = set, `10` = field/type absent (fall back to label), `11` = value
unrecognised, `12` = issue not on the project / not in the repo. `detect-fields.sh` (run once per
groom) emits the field/option IDs into env vars for case-insensitive matching. On GitLab the four
axes are scoped labels via `glab`; on the local Markdown backend they live in task-file frontmatter.

**Bounded context (soft fifth axis)** — a `domain:<context>` label (e.g. `domain:checkout`) is
optional on mono-domain projects but the `## Domain Model` block in every `/task brief` output is
always mandatory. Items touching ≥ 2 bounded contexts automatically trigger the epic detection
heuristic with reason "cross-bounded-context".

**`/task brief` — Domain Model is mandatory.** Every brief the PO generates for a developer MUST
include a `## Domain Model` block with: Bounded context, Vocabulary (ubiquitous language), Entities
(with aggregate root flag), Value objects, Invariants, and Out of scope. A brief without this block
is incomplete — the PO clarifies with the user before issuing it. If a `plan.md` is attached, the
block is written into its technical-context section too (the plan template carries it).

**Tech-debt intake protocol.** When a developer's completion report carries a `Tech debt surfaced`
block, the PO parses it, deduplicates against the current backlog, and opens one classified ticket
per surfaced item: Type `Task`, `tech-debt` label, priority **P0 or P1** — an item had to clear the
four reasons above to be logged at all, so it is never lower. This is automatically triggered — no
manual step required.

**Epics & sub-tasks.** Big work that needs decomposition lives as a parent **epic** with one or more
**sub-tasks**. The link mechanism differs per backend, but the contract is the same: parents cannot
close while any child is still open.

| Backend | Parent → child link                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| local   | `parent: "#NNN"` in the child's frontmatter, plus a `## Sub-tasks` cross-link in the parent file                   |
| github  | Native sub-issues API — children render automatically under the parent's "Sub-issues progress" field on Project V2 |
| gitlab  | Scoped label `parent::#NNN` on the child (Free-tier compatible)                                                    |

Create a child on any backend with the bundled `add.sh --parent <num>` flag — the script writes the
link, attaches to the project/board, and refuses (exit 3) when the named parent doesn't exist:

```bash
.specnaut/scripts/backlog/add.sh "Child title" "Child body" "" --parent 42
```

The bundled `cascade-check.sh <num>` (github + gitlab) is the close gate — exits 11 with the open
children listed when close is unsafe, exits 12 (informational) when the parent is already closed so
callers don't issue a redundant `close` and 422, exits 3 when the parent doesn't exist, exits 0 when
all children are closed. The PO runs it before `gh issue close` / `glab issue close`. The local
backend uses an inline `grep` equivalent.

A companion `propagate-parent-status.sh` keeps the parent's board column honest as children move: a
child entering **In progress** or **In review** promotes a stalled parent (Backlog or Ready → In
progress), and once every child reaches **Done** the parent rolls up to Done. A child moving to
**Ready** is deliberately a no-op — Ready means groomed-and-waiting, not active work, so it must not
promote the parent.

The Product Owner agent **proactively** proposes epic decomposition during `/task add` and during
grooming whenever a request crosses ≥2 subsystems, has more than 5 acceptance-criteria bullets, or
carries trigger phrases like "break down", "phased", "rewrite", "end-to-end". Obvious splits get
auto-created; ambiguous ones get a concrete sub-task list back as a question. You don't have to ask
for the breakdown — the PO surfaces it on its own.

### 5. Claude Code plugin distribution

Specnaut ships a first-class Claude Code plugin (`specnaut-plugin`) available via the Claude Code
marketplace:

```
/plugin marketplace add specnaut/specnaut-marketplace
/plugin install specnaut-plugin@specnaut-marketplace
```

The plugin gives any Claude Code user instant access to the full Specnaut slash-command suite and
sub-agents — no binary, no `specnaut init` required. The plugin assets (the three top-level skills —
`task` with its backlog and phase docs, audit included, `specnaut` and `ship` — the contract skills
they load, and the sub-agents, the audit seats `architect-expert`, `security-expert`,
`performance-expert`, `accessibility-expert` and `dependency-expert` among them) are namespaced
under `/specnaut-plugin:*` (`/specnaut-plugin:task plan`) so they coexist with project-local copies
without collision.

When both the plugin and the binary are in use, `specnaut upgrade` detects the plugin and
auto-migrates vanilla on-disk agents and command files (backed up, then deleted — the plugin serves
them going forward). `specnaut check --project` warns when covered files are missing and the plugin
is not installed, with a recovery hint.

#### The Specnaut Cockpit (Claude Code only)

`specnaut-cockpit` is a second plugin in the same marketplace: a
[Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) for developers who work
with Specnaut in Claude Code. It needs Claude Code v2.1.287 or later.

```
/plugin install specnaut-cockpit@specnaut-marketplace
```

Projects scaffolded with `specnaut init --ai claude` declare it in `.claude/settings.json`, so
Claude Code offers to install it when someone trusts the project. `specnaut upgrade` adds the same
declaration to existing projects.

**What it shows.** A band above the prompt, sized to the terminal width:

```
5h 82% ↻2h10 · 7d 31% ↻3d4h · ctx 48% · $3.12 · ▸ plan ✓ implement ● review ○ merge ○
```

- the 5-hour and weekly usage windows, with the time until each resets: yellow from 80%, red from
  the hold threshold;
- the context fill and the session's cost;
- the chain's progress while the autopilot runs.

A narrow terminal drops the reset times and the chain's detail first, and keeps the windows. Each
window is announced once, as a toast, when it crosses a threshold.

`/cockpit` opens a pane: the limits, this session, the last seven days (cost and 5-hour peak per
day) and the branches that cost the most. `/cockpit hide` and `/cockpit show` toggle the band.

**The quota hold.** The chain runs on autopilot after the plan, so a limit reached mid-run could cut
a phase off halfway, for example a merge without its push. When a window is at or above the hold
threshold (90% by default), the cockpit refuses the Skill call that starts `implement`, `review` or
`merge`. The chain then stops at that phase boundary, the agent reports the window and its reset
time, and `/task <phase>` resumes after the reset. If you reply that it should continue anyway, it
continues, and the same window does not hold it again. The hold is the only call the cockpit ever
refuses.

**Settings** (`/config`, or `/plugin configure specnaut-cockpit@specnaut-marketplace`):

| Option    | Default | Effect                                                     |
| --------- | ------- | ---------------------------------------------------------- |
| `hold_at` | 90      | Window percentage that holds the autopilot. 100 = no hold. |
| `warn_at` | 80      | Window percentage shown in yellow and announced.           |
| `band`    | on      | Off keeps only `/cockpit` and the hold.                    |

To decline it for a project, set `"specnaut-cockpit@specnaut-marketplace": false` under
`enabledPlugins` in `.claude/settings.json`. Upgrades keep that `false`. Deleting the key brings it
back at the next upgrade.

**Where it works.** In Claude Code in a terminal and in the Code tab of the desktop app. In the IDE
extension's chat panel and in `claude -p`, nothing is drawn, but the hold still applies. Rate-limit
windows appear on plans that have them. With an API key, the band shows context, cost and the chain.

**Privacy.** The history (90 days) stays in the mod's store on your machine. Nothing is sent
anywhere. The only process the cockpit starts is `git rev-parse`, to name the current branch.

### 6. Bundled `specnaut-guide` agent

Every scaffold ships a `specnaut-guide` agent that knows Specnaut itself — its commands, harnesses,
backlog backends, and what changed between releases. It auto-triggers on Specnaut-related questions
("how does specnaut X", "what is /task Y", "quoi de neuf") so users on a Specnaut-scaffolded project
can ask the harness about the tool without copy-pasting docs. It uses a vendored knowledge snapshot
for offline / deterministic answers and `WebFetch` against <https://specnaut.com/llms.txt> + the
GitHub Releases API for live "what's new" queries. You can also dispatch it by name with a question.

The agent also handles **bug reports**: ask "report this as a bug" (or hit a Specnaut failure) and
it pre-fills a structured GitHub issue against `specnaut/specnaut-cli` with a 6-section template
(Summary / Repro / Observed / Expected / Environment / Logs), auto-populating the environment block
from `.specnaut/installed.lock` + `specnaut --version` + `uname -srm`, scrubbing common token shapes
(GitHub PATs, GitLab PATs, Anthropic / OpenAI keys, AWS access keys), and handing you a pre-filled
`https://github.com/specnaut/specnaut-cli/issues/new?…` URL to review and submit. The agent never
auto-submits — you always see the body before clicking.

### 7. Bundled `security-expert` agent — two modes

Every scaffold also ships a `security-expert` agent that judges who can reach what, and what they
get when they do. It is read-only (`Read`, `Grep`, `Glob` — no shell) and has two dispatch shapes:

1. **Code review** — dispatched by `/task review` on every diff, straight from your main session
   (there is no review-coordinator), and by `/task audit` (`--security`, or every applicable axis
   with no flag) on a scope you name.
2. **Plan audit** — dispatched by `/task plan` on `plan.md` itself, before any code exists, where
   the expensive findings are cheap.

In both it works from the offline security knowledge base scaffolded at `.specnaut/memory/security/`
— a triage file holding the reachability gate and the severity rubric, then the two or three domain
files that match the scope — cites the file behind each finding, and labels any class in scope that
the base does not cover _not assessed_. It fetches nothing from the network.

It does not triage GitHub's security alerts: the former alert-triage mode, and the `Bash` grant it
needed, are gone. Triage secret-scanning, Dependabot and code-scanning alerts in the repository's
**Security** tab.

### 8. The `/design` skill

Every scaffold also ships a `/design` skill — formerly the `ui-ux-designer` agent — that owns a
single source of truth: the project's `DESIGN.md`, which every agent that builds or reviews UI reads
to keep it on-brand. Its shape is `.specnaut/templates/design-template.md` (brand identity,
typography, colour palette, a 4-point spacing scale, radius and shadow, responsive rules, component
primitives, motion, and a decision log). Three modes auto-select from `DESIGN.md` state:

1. **Discovery** — when `DESIGN.md` is absent. At most four questions (product and audience, visual
   mood, brand seed, and a stack hint only when relevant), skipped when your arguments already carry
   a brief; then `DESIGN.md` is written from the template in one go.
2. **Edit** — when `DESIGN.md` is present and the arguments name a change. One edit per change, each
   with its reason, and a dated line appended to the decision log.
3. **Audit** — when the arguments contain `audit`. It scans
   `**/*.{tsx,jsx,vue,svelte,html,css,scss}` under `src/` and any path you name for literal hex
   colours, off-system fonts, raw pixel spacing and raw font sizes, reports drift in a
   `| File | Line | Found | Expected token | Severity |` table, and ends with `clean` /
   `drift_minor` / `drift_major`.

Only you start it (`disable-model-invocation: true`): a design decision is not cheap, and you own
when one is taken. It writes `DESIGN.md` and nothing else — no source edit, no command, no agent
dispatch; the developer agent is what translates `DESIGN.md` into your theme, CSS variables or
component library. `DESIGN.md` is not scaffolded by `specnaut init`; it appears on the first
`/design` run, so backend-only and CLI-only projects carry no stub they never read.

## Design principles

- **Agnostic of the user project's language** — Python, TypeScript, Go, PHP, Rust… your project,
  your stack.
- **Agnostic of the LLM** — Claude, OpenAI, Gemini, local models, anything your harness supports.
- **Agnostic of the AI harness** — six first-class targets today, with the same core content for
  all.
- **Agnostic of the backlog source** — pick local Markdown or your remote tracker (GitHub Issues +
  Projects, GitLab Issues; Bitbucket planned). The PO agent talks to whichever you chose.
- **Single binary** — distributed via `deno compile` for macOS arm64/x64, Linux arm64/x64, and
  Windows x64. No Python, no `pip`, no extra runtimes on the user's machine.

## Contributing

### Agent adoption

Every `feat:` PR body must include an `## Agent adoption` section with a `` ```prompt `` fenced
block. The release pipeline extracts these into a structured `### Adoption guide` block on the
GitHub Release; `specnaut-guide review-upgrade` plays them back in the user's project after
`specnaut upgrade`.

See the
[CONTRIBUTING guide](https://github.com/specnaut/specnaut-cli/blob/main/CONTRIBUTING.md#agent-adoption)
for the convention and examples. The CI workflow `pr_adoption_lint.yml` in the CLI repo enforces
presence.

### Release notes shape

GitHub Releases bodies are auto-generated by `scripts/gen-changelog.ts` and follow this structure:

1. `### Features` — `feat:` commits, one bullet per commit.
2. `### Bug fixes` — `fix:` commits.
3. `### Adoption guide` — one block per `feat:` PR that has a `## Agent adoption` section in its PR
   body. Format:

````
**#NNN — Feature title**

<prose paragraph from the PR body>

```prompt
<ready-to-paste adoption prompt>
```
````

Consumed by `specnaut-guide review-upgrade` (Phase 4 of the upgrade adoption flow).

4. `### Internal / chores` — `chore:` / `refactor:` / `docs:` / `test:` etc., collapsed under a
   `<details>` block.

If a `feat:` PR is merged without `## Agent adoption`, `gen-changelog.ts` emits a stderr warning
during the release workflow. The release still ships; the missing entry can be amended manually in
the GitHub Release body.

## Upgrades & adoption

`specnaut upgrade` updates templates in place and prints a handoff line inviting the user to review
what changed via the `specnaut-guide` agent.

### Changed in 7.3

Run `specnaut upgrade`. The full notes are in
[`UPGRADING.md`](https://github.com/specnaut/specnaut-cli/blob/main/UPGRADING.md) in the CLI
repository, under "7.2.x → 7.3.0".

- **The constitution moves to `docs/constitution.md`**, byte for byte — see
  [The constitution](#the-constitution-docsconstitutionmd). Upgrade refuses the move, and leaves
  both files as they are, when both exist and differ, when the old file is a link, or when it is not
  UTF-8: resolve it by hand, then upgrade again. `upgrade --dry-run` prints the move without making
  it. `.specnaut/templates/constitution-template.md` is retired: an untouched copy is removed, an
  edited one kept with a warning.
- **Nine agents, down from fifteen.** `review-coordinator`, `test-reviewer`, `workflow-manager`,
  `qa-tester` and `devops-sre` are gone, and with them the handoff, QA-report and alert-triage
  contracts. Review dispatches its seats from your session, `code-reviewer` carries the test
  checklist, and `ui-ux-designer` is the `/design` skill. `upgrade` names the successor of every
  retired agent a file of yours still mentions, and removes nothing you wrote.
- **Plans are briefs, and `tasks` is part of `implement`.** An addendum you wrote for `tasks` is
  carried to `implement` by `upgrade`.
- **`merge: manual` holds harder** — see
  [Keeping a human on the merge](#keeping-a-human-on-the-merge).
- **Codex: trust the hooks again.** The hooks changed, so Codex runs none of them until you open
  Codex in the project, run `/hooks`, and trust Specnaut's hooks; `upgrade` prints the list.
- **Skill overlays are gone.** The `alias_of` and `overlays` frontmatter fields and the alias
  example no longer exist; a skill under your harness's `skills/` directory is simply a skill.

### Moved in 7.2: `/board` and the pipeline are now `/task`

`/board` and the pipeline verbs of `/specnaut` are regrouped into `/task`, and `/specnaut` keeps the
framework only (`doc`, `list`, `upgrade`) — the mapping is in
[The three top-level skills](#the-three-top-level-skills). `specnaut upgrade` carries an edited
phase document to its new address under `task/`, moves an addendum from
`.specnaut/addenda/specnaut/<verb>.md` to `.specnaut/addenda/task/<verb>.md`, and moves the audit
scope script to `.specnaut/scripts/audit/collect-audit-scope.sh`. Saved prompts, your own skills and
the `AGENTS.md` prose that name `/board`, `/specnaut plan` or an `*-audit` skill are yours to
update. The full list, including what happens to retired skills you edited, is in
[`UPGRADING.md`](https://github.com/specnaut/specnaut-cli/blob/main/UPGRADING.md) in the CLI
repository.

### Upgrading from 1.x to 2.x

**2.0.0 is a breaking release.** The canonical migration guide is
[`UPGRADING.md`](https://github.com/specnaut/specnaut-cli/blob/main/UPGRADING.md) in the CLI
repository — read it before running `specnaut upgrade` on a project scaffolded with 1.x. It is kept
there rather than duplicated here so the two cannot drift apart.

What changes, at a glance:

| Before                                                 | After                                                 |
| :----------------------------------------------------- | :---------------------------------------------------- |
| 9 chainable phases                                     | **5** — `plan → tasks → implement → review → merge`   |
| 5 chain flags                                          | **1** — `--manual`                                    |
| up to 8 files per feature                              | **2** — `plan.md` + `tasks.md`                        |
| stops whenever clarification is needed, then pre-merge | **exactly 2** — end of `plan`, and the review verdict |

`brainstorm`, `specify`, `clarify`, `analyze`, `checklist` and `list-skills` no longer exist; an old
phase name prints the phase index and stops. `analyze` was **replaced, not dropped** — with a single
planning document there are no artefacts left to hold in agreement, so its successor is a binding
decision table plus architecture and security audits run against the plan _before any code exists_.

Your existing spec directories are left on disk untouched. Nothing migrates them.

### Files written

- `.specnaut/upgrade-pending.json` — a marker recording the upgrade range:

```json
{
  "from": "1.4.0",
  "to": "1.6.0",
  "at": "2026-05-16T14:33:00.000Z"
}
```

Written on every successful apply. On chained upgrades, the existing marker's `from` is preserved.
Consumed by `specnaut-guide review-upgrade` and by `specnaut reconcile`. Deleted by the agent at the
end of a successful review.

- `.specnaut/upgrade-staging/<path>` — for every file the upgrade preserved (i.e., on-disk version
  was customized vs. lock SHA), the upstream (bundled-template) version is written here under the
  same relative path. The on-disk project file is untouched. The staging directory is the source for
  `specnaut reconcile` (see below).

Both are gitignored (`templates/core/root/.gitignore` ships the lines).

### Handoff line

`specnaut upgrade` ends with:

```
✓ upgraded to templates 1.4.0 → 1.6.0

→ Walk through what's new with your AI:
`@specnaut-guide review-upgrade`
```

An AI agent that sees `.specnaut/upgrade-pending.json` in a project should proactively suggest
running `@specnaut-guide review-upgrade`.

### `specnaut reconcile`

Per-file post-upgrade reconciliation. Run after `specnaut upgrade` for each file that was preserved
(customized locally — see the `Upgrades & adoption` section for context).

```
specnaut reconcile --status
Print JSON listing files currently pending reconciliation. Reads
`.specnaut/upgrade-staging/`. Output:
{
  "pending": [".claude/agents/developer.md", ...],
  "stagingDir": ".specnaut/upgrade-staging" | null
}

specnaut reconcile <path> --accept-upstream
Take the new template version for <path>. Backs up the local file to
`<path>.specnaut.bak`, copies upstream content from
`.specnaut/upgrade-staging/<path>` into place, and updates the lock
SHA. Removes the staging entry.

specnaut reconcile <path> --accept-current
Keep the local customized version. Re-stamps the lock SHA to match
on-disk content, so the next upgrade does not re-flag this file as
preserved. Removes the staging entry.
```

`specnaut-guide review-upgrade` is the recommended way to walk through reconciliation interactively
— it surfaces a `keep / take / merge / view / skip` choice per file and dispatches the `developer`
subagent for intelligent merges.

### `specnaut-guide review-upgrade`

Dispatching `@specnaut-guide review-upgrade` triggers a 7-step guided workflow inside the
`specnaut-guide` agent:

1. **Read marker** — reads `.specnaut/upgrade-pending.json`; exits with instructions if absent.
2. **Fetch releases** — fetches GitHub Release bodies for every tag in `(from, to]` and parses each
   `### Adoption guide` section into structured adoption prompts. Falls back to the vendored
   snapshot if the GitHub API is unreachable.
3. **Present plan** — shows releases in range, adoption prompts count, and files pending
   reconciliation (`specnaut reconcile --status`). Offers to create a branch
   `specnaut-upgrade-v{to}` for review-as-PR.
4. **Walk adoption prompts** — presents each prompt one by one with four options: `[a]` run it
   (dispatches `developer` agent), `[s]` skip, `[c]` show raw prompt, `[q]` quit.
5. **Reconcile customized files** — for each file pending reconciliation, shows a diff summary and
   offers `[k]` keep local, `[t]` take upstream, `[m]` intelligent merge (dispatches `developer`),
   `[v]` view full diff, `[s]` skip.
6. **Cleanup** — when both walks complete with nothing skipped, deletes the marker and (if on the
   review branch) commits a summary. Skipped items are left on disk for the next `review-upgrade`
   run.

Trigger keyword: `review-upgrade` in the dispatch message.

## Repository

Source, releases, and issue tracker:
**[github.com/specnaut/specnaut-cli](https://github.com/specnaut/specnaut-cli)**.

The `AGENTS.md` file at the repo root is the canonical context document for any future Claude Code,
Codex, or other agent session contributing to the project itself.
