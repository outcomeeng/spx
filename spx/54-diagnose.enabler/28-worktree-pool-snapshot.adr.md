# Worktree Pool Snapshot

`spx diagnose` represents worktree topology, canonical-checkout branch standing, and occupancy for worktree-touching checks as one in-process worktree pool snapshot. The snapshot gatherer reads git facts, resolves the canonical checkout and default branch through the state topology API, reads the canonical checkout's symbolic branch through an injected probe, and reads occupancy claims through injected dependencies. The `worktree-pool`, `session-environment`, and `session-store` checks derive their readings from that shared snapshot rather than invoking `spx worktree status`.

## Rationale

The diagnose engine in `spx/54-diagnose.enabler/13-diagnose-engine.adr.md` keeps classification deterministic by separating reading gather from pure verdict functions. Worktree-touching checks share the same reality boundary: canonical-checkout designation and default-branch resolution from `spx/18-state.enabler/32-worktree-topology.enabler`, git topology from `spx/15-worktree-management.pdr.md`, shared occupancy claims from `spx/38-worktree.enabler/21-occupancy-claim.adr.md`, and shared `.spx/worktrees/` state from `spx/17-state.adr.md`. Gathering that reality once prevents divergent observations across checks, avoids recursive CLI process storms, and gives tests a single contract for generated git facts, canonical-branch observations, claim bytes, and process-liveness observations.

Canonical identity and canonical health remain separate. The state topology API designates the main checkout from repository name and placement without consulting a branch. The diagnose command layer then observes whether that designated checkout is attached to the resolved default branch. This composition preserves `spx/15-worktree-management.pdr.md` while allowing the worktree-pool diagnostic to reject a pool whose canonical working copy cannot safely serve default-branch tooling.

The snapshot is command-layer orchestration, not domain classification. Domain check modules continue to expose pure classifiers over their readings, while production wiring supplies the real git-facts gatherer, occupancy filesystem, process table, agent-session environment, and doing-session list at the command boundary.

## Invariants

- For identical git facts, default-branch resolution, canonical-checkout branch observation, claim reads, process table observations, current worktree root, agent-session environment, and doing-session records, the snapshot and all derived readings are identical.
- A non-errored snapshot has exactly one worktree entry for every active worktree root reported by git facts, and the sum of `running` and `free` entries equals the entry count.
- A bare-pool snapshot carries the state topology API's designated main-checkout path, the resolved default branch, and one canonical-checkout branch observation: attached with a branch name, detached, or unavailable.
- A live occupancy claim contributes a normalized session token to the snapshot's live claim set; missing or dead claims classify as `free`.
- A live claim named by `SPX_WORKTREE_CLAIM_PATH` contributes to the snapshot only when its claim filename matches the current worktree entry; when it contributes, it marks that current worktree entry `running` and adds the normalized session token to the live claim set.

## Verification

### Testing

- ALWAYS: the snapshot gather maps injected git facts, canonical-checkout designation, default-branch resolution, canonical-checkout branch observation, occupancy claim reads, and process-liveness observations to bare-repository, linked-worktree, canonical-checkout, current-worktree, running/free, and live-claim-set data without invoking `spx worktree status` ([mapping])
- ALWAYS: a designated canonical checkout maps its symbolic-HEAD observation to attached with a branch name or detached, while a failed default-branch or symbolic-HEAD probe maps to unavailable rather than a healthy branch standing ([mapping])
- ALWAYS: the snapshot gather merges a live `SPX_WORKTREE_CLAIM_PATH` claim into the current worktree entry and live claim set only when the exported claim filename matches the current worktree ([mapping])
- ALWAYS: adding a free worktree or dead claim to an otherwise compliant layout never degrades the worktree-pool verdict and only changes reported occupancy counts ([property])
- ALWAYS: the session-environment reading derives `worktreeClaimed` from the current worktree's snapshot entry plus the hook and agent-session identity inputs ([mapping])
- ALWAYS: the session-store reading derives orphaned doing-session count by joining doing sessions against the snapshot's normalized live claim set ([mapping])
- NEVER: diagnose worktree-touching probes execute `spx worktree status` or parse its JSON output to classify occupancy ([compliance])

### Audit

- ALWAYS: the snapshot gatherer receives git facts, canonical-checkout designation, default-branch resolution, canonical-checkout symbolic-HEAD probing, occupancy storage, process table, current-worktree identity, agent-session environment, and doing-session inputs through explicit dependency parameters, with production defaults wired at the command boundary ([audit])
- ALWAYS: the snapshot gatherer composes `mainCheckoutPath` and default-branch resolution from `spx/18-state.enabler/32-worktree-topology.enabler` rather than deriving canonical identity or the default branch inside diagnose ([audit])
- ALWAYS: worktree-touching domain check modules remain pure over readings or snapshot-derived data and perform no process, git, or filesystem I/O ([audit])
- NEVER: canonical-checkout health changes the state topology API's branch-independent main-checkout designation; diagnose observes branch standing only after designation ([audit])
- NEVER: tests replace git, occupancy, session, or process dependencies with module interception; they use injected implementations, generated raw inputs, and real temp fixtures ([audit])
