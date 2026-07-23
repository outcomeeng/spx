# Plan: agent config

## Harness vocabulary guard

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Purpose

Reconcile Claude Code and Codex configuration from configured harness environment state.

## Governing specs

- `spx/33-harness-environment.enabler/harness-environment.md`
- `spx/33-harness-environment.enabler/21-agent-instructions.enabler/agent-instructions.md`

## Governing decision

`spx/13-agent-capability-lifecycle.pdr.md` requires native projections for explicitly enabled and available Claude Code, Codex, and Pi coding agents while keeping version selection, methodology identity, and user-scope configuration outside this writer.

## Implementation notes

- Reuse useful behavior from the Claude settings subtree only after revalidating it against current product truth.
- Add Pi through a native serializer and projection contract rather than a Claude artifact adapter.
- Separate coding-agent-specific serializers from shared policy resolution.
- Derive status observation and apply writes from one resolved native projection.
- Keep dry-run or preview behavior deterministic if exposed.
- Do not add compatibility names for command paths without a current spec.

## Evidence required

- Tests cover read, reconcile, write, dry-run, idempotency, and invalid config diagnostics.
- Tests cover separate output paths for invoking-agent state and hermetic execution state.

## Parallelization

Can proceed in parallel with instruction management, but review/audit execution should consume this only after its public API stabilizes.

## Settled work

- Baseline Claude Code and Codex agent config reconciliation is settled on `origin/main`.
- Follow-up agent state boundary notes are recorded in the parent harness-environment plan and owning consumer packets.

## Pending lifecycle expansion

- Add Pi-native projection without translating Claude Code artifacts.
- Reconcile only agents that are both explicitly enabled and detected as available.
- Keep exact package selection, methodology identity, and user-scope observation outside this writer.
