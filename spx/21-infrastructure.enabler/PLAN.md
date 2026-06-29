# Plan: Runtime decision relocation

This coordination note records the infrastructure part of the top-level methodology repair.

## Ownership target

Infrastructure should own runtime and operational mechanics. The top-level record should define methodology vocabulary, while infrastructure owns how the product enforces runtime choices.

## Candidate move

Move or re-author the mechanics currently in `spx/12-node-runtime.adr.md` under infrastructure if `/decompose` confirms the top-level methodology PDR covers the product-wide vocabulary reach.

Candidate homes:

- `spx/21-infrastructure.enabler/` for broad Node/package runtime mechanics
- `spx/13-cli.enabler/` only for CLI-specific process runtime behavior
- `spx/26-release.enabler/` only for publish workflow runtime constraints

## Rule for the move

Do not lose product-wide reach accidentally. If runtime remains a product-wide guarantee, preserve it through the top-level methodology PDR or another top-level product decision while moving implementation mechanics under infrastructure.

## Next steps

1. Let `/decompose spx/` settle whether the top-level runtime ADR moves, splits, or stays.
2. Keep runtime mechanics out of `spx/12-spec-tree-methodology.pdr.md` except for vocabulary needed by every later node.
3. Align package, CI, and release assertions after the runtime decision is relocated.

---

## Existing plan: Infrastructure

## Harness governance (queued)

Govern the still-ungoverned infrastructure and remaining cross-domain test harnesses and generators using the node-local harness-governance pattern: author per-module test-harness or generator enablers, run the spec-auditor and test-evidence-auditor gates including coverage, and carry the literal-collision lessons from the completed recording-runner batch in `spx/41-test.enabler/PLAN.md`. This is the catch-all final batch spanning several domains; split into more than one PR if it grows large.

Modules to govern (place each governing node beside its owning domain node):

- `testing/harnesses/github-snapshot-client.ts` → `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler`
- `testing/harnesses/hook-cli.ts` → `spx/21-infrastructure.enabler/54-hooks.enabler`
- `testing/harnesses/agent-run-journal/in-memory-backend.ts` → `spx/15-agent-run-journal.enabler`
- `testing/harnesses/spec-tree/assertions.ts` → no governing node: its only uncovered statement is an unreachable type-narrowing throw reached after `expect()` has already thrown, so a coverage-driven node adds nothing
- `testing/harnesses/with-markdown-env.ts` → `spx/41-validation.enabler/65-markdown-validation.enabler` (reconcile with the validation batch)
- Shared helpers `testing/harnesses/{constants,crypto,git-test-constants}.ts` → govern beside their most-cited domain (crypto → `spx/16-config.enabler/54-canonical-descriptor-digest.enabler`; git-test-constants → `spx/16-config.enabler/21-config-cli.enabler`; constants → its dominant consumer) or extract a shared infrastructure node if genuinely cross-domain
- Remaining generators `testing/generators/{agent-run-journal,compact,release,github-snapshot,sonarqube-cloud,spec-tree}/*.ts` → their owning domain nodes (`15-agent-run-journal`, `37-compact`, `26-release`, `21-infrastructure/43-github-ci`, `23-spec-tree`); the `audit/run-state` generators and their `36-audit/54-branch-run-state` owner were removed with the audit domain's collapse into the journal channel

Route: `/understand` → `/contextualize <owning-node>` per group → `/author` per-module test-harness/generator enablers → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
