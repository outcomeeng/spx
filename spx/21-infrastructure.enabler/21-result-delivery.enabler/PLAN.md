# Plan: Result Delivery

## Harness vocabulary guard

Before applying this plan to verification-run delivery or agentic verification output, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, configured agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

The work below is sequenced against the PDR `spx/21-infrastructure.enabler/21-result-delivery.enabler/15-result-delivery.pdr.md`, which declares the end state.

## Implementation (this node)

`/apply` writes the dispatch contract (the backend port), the environment-driven backend resolution, and the local backend, with tests for the env-to-backend mapping and the idempotent per-marker upsert.

## Backends-as-infrastructure (separate nodes)

Each backend is its own infrastructure node implementing this domain's port; the domain holds only the dispatch contract.

- **GitHub** lives under `spx/21-infrastructure.enabler/43-github-ci.enabler`. The github-pr Snapshot transport (`src/lib/github-snapshot-sink/index.ts`, `src/lib/github-snapshot-sink/pull-request-comment-client.ts`, `src/lib/github-snapshot-sink/gh-api-runner.ts`) carries the backend construction the PDR defers — `gh` behind an injected client, the hidden-marker-tag upsert idempotency, and the content-vs-transport split.
- **GitLab** and **observability** are further infrastructure backend nodes, added by a later `/decompose spx/21-infrastructure.enabler` when built.

## Consumers (refactor onto this domain)

- The GitHub backend (`spx/21-infrastructure.enabler/43-github-ci.enabler`) that delivers an agentic verification run's projection binds result-delivery: it hands the journal-rendered body to result-delivery, which delivers it. `spx/15-agent-run-journal.enabler` renders the event-prefix projection and keeps the event log; it does not call result-delivery.
- `spx/41-validation.enabler` and `spx/41-test.enabler`: render a report and deliver it through result-delivery, holding no backend I/O.
- `spx/34-verification.enabler/21-journal.enabler`: its CI delivery path routes through result-delivery.

## Constraints and sequencing

- Type-agnostic throughout — no verification-type or result-kind vocabulary in the domain, per `spx/34-verification.enabler/13-journal-channel.adr.md`.
- A `0.7.0`-class spx release publishes result-delivery and the GitHub backend before the spec-tree plugin's CI-path PRs (`pr-reviewer` / `pr-review-orchestrator`) adopt it for the human-readable PR-comment verdict surface.
