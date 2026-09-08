# Open Issues

## No plugin declares what it provides or supports

**Evidence:** `AUTHORITY.md` of `outcomeeng/methodology`: "A provider
declares the one version it provides and the range it supports." The
settled home is a `methodology` block with `provides` and `supports` in the
plugin manifest (operator answers recorded on the plugins branch
`work/methodology-versioning-proposal`). All six manifests carry no such
block: `src/plugins/spec-tree/.claude-plugin/plugin.json`,
`src/plugins/spec-tree/.codex-plugin/plugin.json`, and their four built copies
under `dist/claude/spec-tree/` and `dist/codex/spec-tree/`.

**Impact:** the fetch cannot read which line a revision provides, so the line
is the `--line` argument the invoker supplies, `source.json` records no
`provides` or `supports`, and nothing verifies that the `4.0` tree serves a
consumer's `migratingFrom: 3.2.0`.

**Settlement condition:** the two authored manifests carry `provides` and
`supports`; the fetch reads `provides` to choose `methodology/{MAJOR.MINOR}/`
and records both values in `source.json`; the understand payload and the
diagnose check compare the declaration against them per
`spx/13-agent-capability-lifecycle.pdr.md`. Until then the `4.0` tree serves
`3.2.0` on the assumption that the provider of the declared version supports
the version migrated from.

## The codex tree's foundation skill names Claude as the acting agent

**Evidence:** `methodology/4.0/codex/spec-tree/skills/understand/SKILL.md`
carries six sentences naming Claude as the agent that acts — lines 358, 424,
455, 531, 537, and 541 — while the same file's harness substitutions are
fully adapted (`SKILL_DIR` for `CLAUDE_SKILL_DIR`, `AGENTS.md` for
`CLAUDE.md`). The bytes are the `skills/understand/` directory the plugins
repository publishes for the codex plugin at revision
`d53e3b0cb2625f0f1bf362527c69f64e04997940`, recorded in
`methodology/4.0/source.json`.

**Impact:** a Codex session loading the foundation reads that it is Claude,
contradicting the harness identity the same file establishes.

**Settlement condition:** the codex plugin's `understand` skill is built with
agent-appropriate wording at its source in `outcomeeng/plugins`, and a later
`pnpm run methodology:fetch` at that revision replaces the tree here. The
conformance assertion holds each `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/`
byte-identical to the published plugin, so the wording is never corrected in
this repository.
