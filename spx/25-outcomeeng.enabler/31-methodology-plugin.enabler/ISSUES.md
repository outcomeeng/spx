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
