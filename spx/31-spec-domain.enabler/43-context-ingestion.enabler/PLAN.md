# Plan: context-ingestion delivery

Full composition: the six children cover every known concern; no index horizon
is reserved.

## Pending declaration work

1. Amend `spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.adr.md`
   for schema v2: the `spx spec context show <targets...>` replacement contract
   (one breaking change, no alias), guide entries reclassified to the listed
   class, the `methodology` read-role group, and multi-target bundle shape with
   per-target coverage references.
2. Author the build-time baking ADR in
   `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/`:
   snapshot source location in this repository, embed mechanism for `tsx` and
   `dist` execution paths, methodology-identity stamping, and the update path
   from the plugins repository as methodology authority.

## Pending evidence work

1. `spx/31-spec-domain.enabler/43-context-ingestion.enabler/54-read-set-projection.enabler`
   declares guides as listed-class entries; the linked read-set and
   manifest-mapping tests still assert read-class guides, so the node is
   failing until `/apply` realigns evidence and implementation.
2. `spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler`
   declares product-root coordination notes as root-artifact guidance (see the
   node's `ISSUES.md`); the linked mapping test lacks that case until `/apply`
   adds it.
3. `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler`
   and
   `spx/31-spec-domain.enabler/43-context-ingestion.enabler/76-multi-target-composition.enabler`
   are declared without evidence and sit in `spx/EXCLUDE` until `/apply`
   writes their tests.
4. Regenerate committed `spx.status.json` projections on fresh `dist` over the
   full suite before merge — the test moves change every affected node's
   evidence references.

## Later slices

1. Consumer adoption: route `/understand`, `/contextualize`, compaction
   recovery, and applicable subagent prompts through
   `spx spec context show`; the skill changes live in the plugins repository
   and are filed into its session queue via `/issue`.
2. `spx spec status show [targets...]` with target scoping under
   `spx/29-verification-path-scope.pdr.md` operand vocabulary — declared under
   the status-owning nodes as a separate changeset.
