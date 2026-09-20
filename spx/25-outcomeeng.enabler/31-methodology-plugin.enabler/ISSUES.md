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

## The tree-address evidence never binds an address to a supplied root

**Evidence:** `tests/tree-address.property.l1.test.ts` exercises `methodologyLine` and `methodologyTreeRelativeDir` only; `methodologyTreeDir` and `methodologyLineDir` in `src/lib/methodology/tree.ts`, the functions that join an address to a supplied tree root, are reached by no test in this node.

**Impact:** the clause "resolved from spx's package root … no consumer path participates in resolution" is carried by the `[audit]` rules of `21-tree-fetch.adr.md` and by structure, not by executed evidence.

**Settlement condition:** the property drives `methodologyTreeDir` and `methodologyLineDir` with a generated root and line and asserts the composed path against the generator's construction.

## The fetch evidence rests on hand-picked argument rows and a harness-composed manifest

**Evidence:** `tests/fetch.mapping.l1.test.ts` enumerates five argument-vector rows by hand over the `FETCH_ARGUMENT_FLAGS` × terminator domain, omitting the terminator with `--revision`, the terminator with both flags, and a bare terminator. `testing/harnesses/methodology/plugins-repository.ts` composes every published `plugin.json` from `PLUGIN_MANIFEST_FIELDS` in `src/lib/methodology/fetch.ts`, the table `parsePluginManifest` reads, so no captured real manifest anchors the field vocabulary the plugins repository owns. `tests/fetch.compliance.l1.test.ts` calls `runMethodologyFetch` directly; `scripts/fetch-methodology.ts` has no thin script test and a tag revision is never passed.

**Impact:** a drift between spx's manifest field table and the published schema moves harness and parser together and is undetectable here; an argument combination outside the five rows is unverified; the script entry's parse, root derivation, and exit mapping carry no evidence.

**Settlement condition:** the mapping domain is generated from the source-owned flag registry; a captured real `plugin.json`, read by path and naming its plugins-repository revision, anchors the manifest oracle; a thin script test drives `scripts/fetch-methodology.ts` and a tag revision reaches `cloneAtRevision`.
