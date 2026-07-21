# Plan: context-ingestion delivery

Full composition: the six children cover every known concern; no index horizon
is reserved.

## Pending implementation work (for `/apply`)

1. Move the projection's pure computation into the spec-tree library behind
   `src/lib/spec-tree/index.ts` per the amended
   `spx/14-cli-composition.adr.md` and
   `spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.adr.md`:
   `src/domains/spec/context-target.ts` and
   `src/domains/spec/context-manifest.ts` move in and are removed at their old
   paths with all imports updated — no re-exports, no aliases. New pure
   modules for read-set planning and bundle composition join them there.
2. Methodology-manifest validation and catalog mapping are methodology
   capability computation per
   `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md`
   — pure functions over supplied bytes, outside the spec-tree library, with
   the installed-package read entering the command handler through an
   injected reader port.
3. Extend the top-level `methodology` config descriptor
   (`src/config/methodology.ts`) with the installed methodology package
   location the reader resolves, per the same decision.
4. Replace the `spec context` registration in `src/interfaces/cli/spec.ts`
   with the `show <targets...>` form — no legacy single-target registration,
   no alias — and shrink `src/commands/spec/context.ts` to root resolution,
   snapshot construction, and byte reads through injected dependencies.

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
