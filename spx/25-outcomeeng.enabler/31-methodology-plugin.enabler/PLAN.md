# Plan: methodology plugin

## Pending steps

1. `scripts/fetch-methodology.ts`, run through `pnpm run methodology:fetch -- [--revision <ref>] [--line <MAJOR.MINOR>]`: sparse blobless clone of `https://github.com/outcomeeng/plugins.git` at the revision (default `main`) into a temp directory, `git rev-parse` to one commit, read `dist/claude/spec-tree/.claude-plugin/plugin.json` and `dist/codex/spec-tree/.codex-plugin/plugin.json`, derive the line from `methodology.provides` or the `--line` argument, remove `methodology/{line}/`, copy each agent's `skills/understand/` into `methodology/{line}/{agent}/spec-tree/skills/understand/`, write `methodology/{line}/source.json`.
2. `package.json`: add the `methodology:fetch` script and `methodology` to `files`; the reader resolves `../methodology` relative to the entry module, valid for `src/cli.ts` and `dist/cli.js` alike.
3. Remove `methodology/4.0.0/` and produce `methodology/4.0/` by running the fetch at the plugins default-branch tip with `--line 4.0`.
4. `.github/workflows/methodology-fetch.yml`: `repository_dispatch` (type `plugins-published`, `client_payload.revision`) and `workflow_dispatch` (inputs `revision`, `line`); runs the fetch, commits to `work/methodology-fetch-{revision}`, pushes with `--force-with-lease` and opens a pull request using the `METHODOLOGY_FETCH_TOKEN` secret so the gate runs.
5. Plugins-side sender, authored in a plugins pool worktree: a workflow on push to `main` touching `dist/**` that sends `repository_dispatch` to `outcomeeng/spx` with the pushed SHA, authenticated with the `SPX_DISPATCH_TOKEN` secret.
6. Route the node's untagged assertions through `/apply` and `/verify`; the fetch verifies against a local bare repository shaped like the plugins repository's `dist/` layout, never against the network.
