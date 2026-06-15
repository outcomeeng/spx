# Review Run Journals

A review run is one append-only event journal stored under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` for branch targets and `.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl` for pull-request targets, at the Git common-dir product root, bound to the appendable journal store of `spx/18-state.enabler/71-appendable-journal-store.enabler/` over that run file path. The run's events are the sole source of truth; the `ReviewRunState` envelope and latest-review lookup are projections folded from the event history, and the run seals at terminal completion. Branch slugging, run-file naming, and the store and seal-marker mechanics are owned by `spx/18-state.enabler`; reviewing owns the run's event vocabulary, the `pr-{number}` target slug, and the projection fold.

## Rationale

Binding each run to the journal contract of `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md` makes reviewing one consumer of the same append/read/render/seal contract every agentic verdict-mode run uses, so a run persists once as facts and renders identically into status, reports, and PR-comment projections. Folding the `ReviewRunState` envelope as a projection rather than writing a bespoke terminal record keeps the run's source of truth a pure event history. Storing review state under the shared branch scope keeps review evidence aligned with the reviewable unit while the `review` domain noun keeps it separate from audit; pull-request targets use a `pr-{number}` branch-scope slug so branch and pull-request targets cannot collide.

Rejected: a write-once terminal JSONL record (a single bespoke record carries no incremental history, so status and PR-comment projections have nothing to replay and an interrupted run leaves no partial trail); a root-level `.spx/review/` directory (it breaks the per-reviewable-unit branch scope); and sharing audit run files (audit and review stay separate domains under one branch scope).

## Invariants

- A run file is the JSONL event history of exactly one journal stream; its seal-marker path is `{run-file-path}.sealed`.
- The `ReviewRunState` envelope is a pure projection of a run's event prefix: the same events always fold to the same envelope.
- `ReviewRunState` carries the target kind, target slug, target display name, reviewer identifiers, base ref, optional base SHA, head SHA, review config digest, start and completion timestamps, output paths, and a terminal status of `approved`, `rejected`, `failed`, or `interrupted`.
- `ReviewRunState.status` values are lowercase machine tokens rendered to CLI display through a fixed mapping: `approved` → `APPROVED`, `rejected` → `REJECT`, `failed` → `FAILED`, `interrupted` → `INTERRUPTED`.
- `baseSha` is recorded when the base ref resolves to a commit SHA before reviewer execution and omitted only when the base ref cannot be resolved inside the local hermetic review boundary; `headSha` is always recorded because the reviewed target is pinned to a concrete head commit.
- A review run is terminal evidence only when its journal is sealed; an unsealed run — or a sealed run whose history holds no readable terminal-completion event — is incomplete evidence and folds to no approved or rejected status.
- Branch target slugs use the state-store branch-slug implementation and stay within the 120-byte component limit; pull-request target slugs are `pr-{number}` with `{number}` an unsigned base-10 pull request number (no sign, decimal point, separator, or whitespace).
- Latest terminal review lookup orders runs by greatest completion timestamp, then greatest start timestamp, then lexicographically greatest run-file name.
- The `.spx/branch/` root resolves relative to the Git common-dir product root per `spx/15-worktree-management.pdr.md`.

## Verification

### Audit

- ALWAYS: bind each review run to the appendable journal store of `spx/18-state.enabler/71-appendable-journal-store.enabler/` over the run file path, and treat the event history as the run's source of truth per `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md` ([audit])
- ALWAYS: render the `ReviewRunState` envelope and latest-review lookup as a projection folded from a run's event history, never from a bespoke terminal record ([audit])
- ALWAYS: seal a run's journal at terminal completion, and gate terminal evidence on the seal marker read from the store — surface an unsealed run, or a sealed run whose history holds no readable terminal-completion event, as incomplete ([audit])
- ALWAYS: store branch review run state under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` and pull-request review run state under `.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl` at the Git common-dir product root, per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: reuse the branch-slug implementation of `spx/18-state.enabler/32-scope-addressing.enabler/` for branch review target slugs, keeping target slugs at or below 120 UTF-8 bytes ([audit])
- ALWAYS: encode pull-request target slugs as `pr-{number}` using an unsigned base-10 pull request number ([audit])
- ALWAYS: fold the target kind, target slug, target display name, reviewer identifiers, base ref, optional base SHA, head SHA, review config digest, run timestamps, output paths, and terminal status into the `ReviewRunState` projection ([audit])
- ALWAYS: select the latest terminal review by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run-file name ([audit])
- ALWAYS: render persisted lowercase status tokens to CLI display through the fixed `approved` → `APPROVED`, `rejected` → `REJECT`, `failed` → `FAILED`, `interrupted` → `INTERRUPTED` mapping ([audit])
- ALWAYS: derive shared path-component names (`.spx`, `branch`, `review`, `runs`, `run-`, `.jsonl`) from state-store defaults ([audit])
- NEVER: persist review run state as a write-once terminal JSONL record outside the event-journal contract ([audit])
- NEVER: store review run state under `.spx/branch/{branch-slug}/audit/` or a root-level `.spx/review/` directory ([audit])
- NEVER: hardcode the strings `.spx`, `branch`, `review`, `runs`, `run-`, or `.jsonl` outside source-owned state-store defaults ([audit])
- NEVER: treat audit domain records as review domain records even though both share branch scope ([audit])
