# Open Issues

## The tree is spx's shipped asset, and nothing fetches it

**Evidence:** `methodology-plugin.md` declares "one coding-agent-native tree
per methodology version the product declares," addressed under "a product
directory," with a provenance record and a content digest, and materialization
that "selects the plugin version whose declared supported-methodology range
contains the tree's methodology version." The tree is spx's own: it ships
inside the CLI from `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/` in
this repository, a consumer commits nothing, and the reader resolves it from
spx's package root. spx has no command that fetches
`https://github.com/outcomeeng/plugins.git` at a revision and writes
`dist/{claude,codex}/spec-tree/skills/understand/` into that layout, and the
plugins repository sends no `repository_dispatch` to spx on push. The
directory on disk is `methodology/4.0.0/`, a patch-versioned name the layout
does not admit, holding plugin 0.88.0 copied from a Codex account cache at
`6d1c6e47` while the plugins checkout is at 0.92.8; its `provenance.json`
records a `methodologyVersion` no plugin declaration backs and a digest
nothing checks.

**Impact:** `--understand` serves bytes whose origin is a coding agent's
cache, under a directory name the consumer declaration cannot address, and no
push to the plugins repository changes what spx ships.

**Settlement condition:** the spec declares the tree as spx's shipped asset
at `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/`, resolved from spx's
package root; spx carries a fetch command that clones the plugins repository
at a named revision, writes the understand skill for each coding-agent build
into that layout, and records the fetched revision; spx's CI runs it on a
`repository_dispatch` from the plugins repository's push and on demand,
opening a pull request that passes the normal gate; the directory is
`methodology/4.0/`; the provenance record and digest are removed or reduced
to the fetched revision.

## No plugin declares what it provides or supports

**Evidence:** `AUTHORITY.md` of `outcomeeng/methodology`: "A provider
declares the one version it provides and the range it supports." The
settled home is a `methodology` block with `provides` and `supports` in the
plugin manifest (`PROPOSED.md` of `outcomeeng/plugins`, "Provider and plugin
compatibility"; operator answers recorded on branch
`work/methodology-versioning-proposal`). All six manifests carry no such
block: `src/plugins/spec-tree/.claude-plugin/plugin.json`,
`src/plugins/spec-tree/.codex-plugin/plugin.json`, and their four built copies
under `dist/claude/spec-tree/` and `dist/codex/spec-tree/`, at 0.92.8.

**Impact:** the fetch cannot read which line a revision provides, so the line
is an argument the invoker supplies, and nothing verifies that the `4.0`
tree serves a consumer's `migratingFrom: 3.2.0`.

**Settlement condition:** the two authored manifests carry `provides` and
`supports`; the fetch reads `provides` to choose `methodology/{MAJOR.MINOR}/`;
spx checks that a consumer's `version` equals `provides` and that its
`migratingFrom` falls within `supports`, failing loudly otherwise; until then
the invoker's line argument stands and the `4.0` tree serves `3.2.0` on the
assumption that the provider of the declared version supports the version
migrated from.
