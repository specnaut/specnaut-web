# Where Specnaut Cloud credentials are stored

`specnaut cloud login` (#353) — or its top-level alias **`specnaut login`** — obtains an access token
+ refresh token for your Specnaut Cloud deployment. Those are secrets; this page explains where they
are kept at rest and how to control it. (To connect from scratch, run `specnaut init --backlog cloud`
then `specnaut login`.)

## Login discloses its target before authenticating

Before opening the browser, login prints the deployment URL it is about to authenticate against and
where that URL came from, and asks for confirmation the **first** time you authenticate against a URL
supplied by a project's `.specnaut/backlog-config.yml` (#400) — so a cloned repo can't silently
redirect your login at an attacker host:

```
  Connecting to:  https://your-deployment.convex.site
  Source:         project config (.specnaut/backlog-config.yml)
```

An explicit `--api-url <url>`, an interactively-typed URL, and re-login to a deployment you've used
before proceed without the prompt.

## Two backends, selected automatically

On every command, Specnaut picks a credential store for the current machine and session:

| Backend                     | When it is used                                                                   | Where the secret lives                                                                  |
| --------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **OS keychain** (preferred) | A keyring is reachable (desktop, unlocked session)                                | macOS Keychain · Linux libsecret (gnome-keyring / KWallet) · Windows Credential Manager |
| **`0600` file** (fallback)  | No reachable keyring — headless servers, CI, SSH sessions, or a build without FFI | `~/.specnaut/credentials.json`, mode `0600` inside a `0700` directory                   |

`specnaut cloud login` prints which store secured your token:

```
✓ authenticated with Specnaut Cloud
  credentials stored in the OS keychain
```

or, on a headless box:

```
✓ authenticated with Specnaut Cloud
  credentials stored in ~/.specnaut/credentials.json (0600 — no OS keychain available)
```

The selection is made **per invocation** — a token written under one environment is never silently
served from a different store under another.

## How the keychain is reached (and what it never does)

The keychain is accessed through the platform's **native API via Deno FFI** (`SecKeychain*` on
macOS, `secret_password_*` on Linux, `Cred*W` on Windows). The secret is only ever passed as an
in-process function argument — it is **never** handed to a spawned process. In particular Specnaut
does not shell out to `security -w`, `secret-tool store`, or `cmdkey /pass:`, all of which would
expose the token on the process command line (readable by `ps`).

The keychain path needs the `--allow-ffi` permission, which the released binary ships with. If FFI
is unavailable (a custom build without the flag, or a sandbox that denies it), Specnaut falls back
to the `0600` file — login still succeeds.

## Headless / CI

Set `SPECNAUT_CLOUD_TOKEN` to a Cloud API token. It bypasses both stores entirely; no keychain
access is attempted. This is the supported path for CI and unattended VMs (it is unchanged from
#353).

## Upgrading from a file-only version

Earlier versions stored credentials only in `~/.specnaut/credentials.json`. There is **no automatic
migration** into the keychain — simply run `specnaut cloud login` once more on a machine with a
keyring and the token is re-stored in the OS keychain. The old file entry can be removed with
`specnaut cloud logout` beforehand if you want a clean slate.

## Multiple deployments

Both stores key credentials by the deployment's API base URL, so one machine can hold tokens for
several Specnaut Cloud deployments without collision.
