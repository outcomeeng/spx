# Plan: committed methodology package adoption

> Reconcile against `spx/31-spec-domain.enabler/43-context-ingestion.enabler/PLAN.md`
> and `spx/PLAN.md` before acting. Governing artifacts are
> `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md`
> and `spx/25-outcomeeng.enabler/31-methodology-package.enabler/methodology-package.md`.

## Pending steps

1. Materialize the per-agent package trees and their provenance records under the
   governance of `spx/25-outcomeeng.enabler/31-methodology-package.enabler`, one tree
   per coding agent the methodology source builds, with no cross-agent translation.
2. Replace installed-package resolution in the payload reader with selection of the
   committed tree for the coding agent in scope, keeping manifest parsing, schema
   validation, provenance comparison, and catalog mapping pure over supplied bytes and
   the tree read behind the injected reader.
3. Remove the `packageDir` field from the `methodology` config descriptor in
   `src/config/methodology.ts`; version and source remain, and no installed-package
   location participates in resolution.
4. Re-establish evidence for the four assertions whose subject moved from the installed
   package to the committed tree, and establish evidence for the two untagged
   compliance assertions covering provenance-version divergence and per-agent tree
   selection. Route both through `/apply`, which invokes `/verify` to select each
   assertion's verification type before any test is written.
5. Keep methodology test infrastructure free of installed-package resolution: a harness
   that locates an agent-local package has no consumer once the payload reads the
   committed tree, and its presence would reintroduce the run-time dependency the
   decision removes.

## Verification route

- `tsx src/cli.ts validation markdown` over the touched node directories
- `pnpm run validate`
- `tsx src/cli.ts test spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler`
- test-evidence and implementation audits through their configured agents
- `/merge`
