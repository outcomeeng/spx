# Plan: Infrastructure

## Harness governance (queued)

Govern the still-ungoverned infrastructure and remaining cross-domain test harnesses and generators per the **Remaining harness governance program** in `spx/PLAN.md` (uniform approach, audit gates, and literal-collision lessons). This is the catch-all final batch spanning several domains; split into more than one PR if it grows large.

Modules to govern (place each governing node beside its owning domain node):

- `testing/harnesses/github-snapshot-client.ts` → `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler`
- `testing/harnesses/hook-cli.ts` → `spx/21-infrastructure.enabler/54-hooks.enabler`
- `testing/harnesses/agent-run-journal/in-memory-backend.ts` → `spx/15-agent-run-journal.enabler`
- `testing/harnesses/agent-environment/runtime-config.ts` → `spx/33-agent-environment.enabler/32-runtime-config.enabler`
- `testing/harnesses/spec-tree/assertions.ts` → `spx/23-spec-tree.enabler` (the spec-tree env itself is governed under `spx/22-test-environment.enabler` — reconcile)
- `testing/harnesses/with-markdown-env.ts` → `spx/41-validation.enabler/65-markdown-validation.enabler` (reconcile with the validation batch)
- Shared helpers `testing/harnesses/{constants,crypto,git-test-constants}.ts` → govern beside their most-cited domain (crypto → `spx/16-config.enabler/54-canonical-descriptor-digest.enabler`; git-test-constants → `spx/16-config.enabler/21-config-cli.enabler`; constants → its dominant consumer) or extract a shared infrastructure node if genuinely cross-domain
- Remaining generators `testing/generators/{agent-run-journal,compact,release,github-snapshot,sonarqube-cloud,spec-tree}/*.ts` → their owning domain nodes (`15-agent-run-journal`, `37-compact`, `26-release`, `21-infrastructure/43-github-ci`, `23-spec-tree`); the `audit/run-state` generators and their `36-audit/54-branch-run-state` owner were removed with the audit domain's collapse into the journal channel

Route: `/understand` → `/contextualize <owning-node>` per group → `/author` per-module test-harness/generator enablers → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
