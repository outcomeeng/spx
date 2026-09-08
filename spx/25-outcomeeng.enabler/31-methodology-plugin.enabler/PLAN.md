# Plan: methodology plugin

## Pending steps

1. Operator action, outside the repository: create the `METHODOLOGY_FETCH_TOKEN`
   secret on `outcomeeng/spx` (a token that can push a branch and open a pull
   request) and the `SPX_DISPATCH_TOKEN` secret on `outcomeeng/plugins` (a token
   with repository-dispatch rights on `outcomeeng/spx`). Until both exist,
   `.github/workflows/methodology-fetch.yml` runs only through
   `workflow_dispatch` and its pull-request step fails naming the missing
   token.
2. Carry the plugins-side sender through its own lifecycle in the plugins
   repository: branch `work/dispatch-spx-methodology-fetch` at `6a3120ae7`
   adds `.github/workflows/dispatch-spx-methodology-fetch.yml` (push to `main`
   touching `dist/{claude,codex}/spec-tree/**` posts a `plugins-published`
   repository dispatch carrying the pushed commit). It is pushed and has no pull
   request yet; open and merge it from a plugins pool worktree.
