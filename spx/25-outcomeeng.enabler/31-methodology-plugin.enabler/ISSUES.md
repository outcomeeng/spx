# Open Issues

## Published plugin artifacts declare no supported-methodology range

`spx/13-agent-capability-lifecycle.pdr.md` requires a published Outcome Engineering
artifact to declare the methodology-version range it supports alongside its own version,
so a consumer selecting an artifact for a methodology version reads that range instead of
comparing two unrelated numbering schemes.

No published artifact declares one yet. The `spec-tree` plugin's `plugin.json` carries
`name`, `version`, `description`, `author`, `repository`, `license`, `keywords`, `skills`,
and `interface`, in both the Claude and Codex builds, with no field naming a methodology
version or range.

**Impact:** materialization cannot compute which plugin version serves a given methodology
version. The choice is made when a tree is materialized and recorded in that tree's
provenance record, so the tree states which plugin version it carries and which
methodology version it serves, but nothing verifies the pairing.

**Scope:** the declaration belongs to the artifact publisher, not to this product. The
reader is unaffected either way — it addresses a committed tree by declared methodology
version and coding agent and performs no range comparison.

**Resolution:** route the range declaration to the Outcome Engineering plugin repository
through `/issue`. When published artifacts carry it, materialization computes the plugin
version instead of recording an operator choice, and provenance validation gains a pairing
check. Remove this entry when materialization reads a declared range.
