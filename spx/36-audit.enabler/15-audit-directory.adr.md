# Audit Node Directory Structure

## Purpose

This decision governs how audit verdict files are named and organized on disk under `.spx/nodes/`.

## Context

**Business impact:** Agents and CI pipelines need to locate the most recent verdict for a given spec node without scanning all stored verdicts. Multiple audits of the same node must coexist so history is preserved.

**Technical constraints:** `.spx/` is gitignored and resolves to the main repository root per PDR-15. The layout must accommodate future per-node artifact types (coverage snapshots, future tooling) without restructuring.

## Decision

Audit verdicts are stored under `.spx/nodes/` using a two-level layout:

```
.spx/nodes/
  {encoded-node-path}/
    {YYYY-MM-DD_HH-mm-ss}.audit.xml
```

**Path encoding:** The spec node path (e.g., `spx/17-file-inclusion.enabler/21-ignore-source.enabler`) is encoded by replacing every `/` with `-`, yielding `spx-17-file-inclusion.enabler-21-ignore-source.enabler`. This mirrors the convention Claude Code uses for per-project directories.

**Filename:** `{YYYY-MM-DD_HH-mm-ss}.audit.xml` — timestamp format from ADR `21-timestamp-format` in `36-session.enabler`, with `.audit` infix to distinguish verdict files from other future per-node artifact types.

**Latest verdict:** The lexicographically last `.audit.xml` file in the node directory is the most recent audit.

## Rationale

A flat single directory under `.spx/audits/` would merge verdicts for all nodes, requiring filename parsing to locate a specific node's history. A nested hierarchy mirroring `spx/` would encode the spec tree path in directory nesting, making directory creation expensive and path manipulation error-prone.

The per-node flat directory approach (one directory per node, files accumulate inside) matches Claude Code's per-project directory pattern: a single path-encoded directory per logical entity, all artifacts for that entity co-located, with timestamp-based filenames for ordering. This gives fast per-node enumeration, natural history accumulation, and room for future artifact types without restructuring.

No status subdirectories are needed: audit verdicts are write-once artifacts. Unlike sessions, which transition between `todo`, `doing`, and `archive`, a verdict is emitted once and never changes state.

Alternatives rejected:

- **Flat `.spx/audits/`**: All nodes share one directory; locating a specific node's verdicts requires filtering by filename prefix.
- **Nested `.spx/audits/spx/17-.../21-.../`**: Mirrors spec tree in filesystem; directory creation requires multiple `mkdir -p` calls; path manipulation is brittle across platforms.
- **`.spx/audits/` with status subdirectories**: Verdicts have no state transitions; status directories add ceremony with no benefit.

## Trade-offs accepted

| Trade-off                                                     | Mitigation / reasoning                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `.spx/nodes/` is a shared namespace for future artifact types | `.audit` infix in filename prevents collisions; future types use their own infix (e.g., `.coverage.json`)            |
| Verdict history grows unbounded                               | Future `spx audit prune` command will manage retention, analogous to `spx session prune`                             |
| Path encoding loses the original separator                    | Encoding is deterministic and reversible; the original path is preserved inside the XML `<spec_node>` header element |

## Invariants

- Each spec node maps to exactly one directory name under `.spx/nodes/` — the encoding is a pure function of the node path
- Verdict files within a node directory are never renamed or moved — timestamps are assigned at write time and are stable
- The `.spx/nodes/` root is always resolved relative to the main repository root per PDR-15

## Compliance

### Recognized by

A verdict file at `.spx/nodes/spx-17-file-inclusion.enabler-21-ignore-source.enabler/2026-04-25_15-45-00.audit.xml`.

### MUST

- Encode spec node paths by replacing `/` with `-` — no other transformation ([review])
- Name verdict files `{YYYY-MM-DD_HH-mm-ss}.audit.xml` using UTC timestamps ([review])
- Resolve `.spx/nodes/` relative to the main repository root via `detectMainRepoRoot` per PDR-15 ([review](../15-worktree-resolution.pdr.md))
- Derive all path component names (`.spx`, `nodes`) from `DEFAULT_AUDIT_CONFIG` — single source of truth ([review])

### NEVER

- Create status subdirectories under a node directory — verdicts have no state transitions ([review])
- Hardcode the strings `"nodes"` or `".spx"` outside of `DEFAULT_AUDIT_CONFIG` ([review])
- Use `/` in encoded directory names — breaks filesystem portability ([review])
