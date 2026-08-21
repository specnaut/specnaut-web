# Hosting — how `specnaut.com` is served

Operational notes for the docs site. Update this file whenever the serving path changes.

## The serving path, as verified

`specnaut.com` is served **directly by GitHub Pages**. Nothing sits in front of it.

```
$ curl -sI https://specnaut.com | grep -i '^server:'
server: GitHub.com
```

No `cf-ray` header, no proxy, no CDN of our own. The custom domain is enforced server-side by the
`docs-dist/CNAME` file that `scripts/build-docs.ts` emits on every deploy — see that file's
docstring for why the artifact's CNAME is the source of truth rather than the repo settings UI.

Deploys run from `.github/workflows/pages.yml`: on every push to `main`, on `workflow_dispatch`, and
nightly at 06:00 UTC so the displayed CLI version and `version.json` track new
`specnaut/specnaut-cli` releases without a manual trigger. `version.json` is regenerated in lockstep
with each deploy.

**`app.specnaut.com` is a different thing** — the Cloud app, which does sit behind Cloudflare. Its
operational notes live in the Cloud half's `DEPLOY.md`, not here. Don't reason about one from the
other.

## AI crawler access

`llms.txt` exists to be read by LLM fetchers ([llmstxt.org](https://llmstxt.org)), so the question
that matters is whether they can reach it. Today they can, because GitHub Pages applies no bot
challenge:

```bash
for ua in "ClaudeBot/1.0" "GPTBot/1.2" "PerplexityBot/1.0" "CCBot/2.0"; do
  printf '%-16s %s\n' "${ua%%/*}" \
    "$(curl -s -o /dev/null -w '%{http_code}' -A "$ua" https://specnaut.com/llms.txt)"
done
```

All four return `200`. Run the same check for `/version.json` and the HTML root after any change to
the serving path.

### Historical note — the Cloudflare allow-list (#145)

This file previously documented a Cloudflare **AI Crawlers** allow-list as the resolution of #145:
Bot Fight Mode was challenging LLM fetchers, and every AI-category crawler was set to _Allow_ at the
zone level.

That configuration no longer applies to this site. It was made on a zone that fronted the old
`*.makerlabs.dev` hostname; the docs moved to `specnaut.com` on GitHub Pages, and Cloudflare left
the path entirely. The file kept describing the allow-list as live for as long as nobody checked a
response header — while its own tables listed a `specnaut.com` hostname inside a `makerlabs.dev`
zone, which cannot both be true.

The underlying concern is resolved, not abandoned: the check above is what proves it, and it is
cheap to re-run. **If a proxy is ever put back in front of this site, bot challenges become live
again and that check is the first thing to fail.**
