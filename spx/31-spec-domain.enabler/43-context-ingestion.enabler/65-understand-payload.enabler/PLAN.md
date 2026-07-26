# Plan: committed methodology plugin adoption

> Reconcile against `spx/31-spec-domain.enabler/43-context-ingestion.enabler/PLAN.md`
> and `spx/PLAN.md` before acting. Governing artifacts are
> `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md`
> and `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/methodology-plugin.md`.

## Pending steps

1. Materialize the per-coding-agent plugin trees and their provenance records under the
   governance of `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler`, one tree per
   coding agent the marketplace builds, with no cross-coding-agent translation. The
   agreed layout is `methodology/{coding-agent}/{plugin}/`, so the spec-tree plugin
   materializes to `methodology/claude/spec-tree/` and `methodology/codex/spec-tree/`,
   each root carrying its own provenance record. The coding-agent set is enumerated from
   the marketplace rather than named in code, so a further coding agent is a new
   directory rather than a source change.
2. Replace installed-plugin resolution in the payload reader with selection of the
   committed tree for the coding agent in scope, keeping manifest parsing, schema
   validation, provenance comparison, and catalog mapping pure over supplied bytes and
   the tree read behind the injected reader.
3. Remove the `packageDir` field from the `methodology` config descriptor in
   `src/config/methodology.ts`; version and source remain, and no installed-plugin
   location participates in resolution.
4. Correct `methodology.version` in `spx.config.yaml` so it declares the methodology
   version rather than the plugin version, matching the managed instruction markers in
   `CLAUDE.md` and `AGENTS.md`. The plugin version stays a separate axis, and
   `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/ISSUES.md` records that the
   compatibility relation between the two has no published source yet.
5. Re-establish evidence for the assertions whose subject moved from the installed plugin
   to the committed tree, and establish evidence for the two untagged compliance
   assertions covering digest divergence and per-coding-agent tree selection. Route both
   through `/apply`, which invokes `/verify` to select each assertion's verification type
   before any test is written.
6. Keep methodology test infrastructure free of installed-plugin resolution: a harness
   that locates a coding-agent-local plugin has no consumer once the payload reads the
   committed tree, and its presence would reintroduce the run-time dependency the
   decision removes. `testing/harnesses/spec/context.ts` still names its fixture
   directory `methodology-package`; rename it with the reader rewrite.

## Verification route

- `tsx src/cli.ts validation markdown` over the touched node directories
- `pnpm run validate`
- `tsx src/cli.ts test spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler`
- test-evidence and implementation audits through their configured agents
- `/merge`
