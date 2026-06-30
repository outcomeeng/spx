# Root coordination plan

This note groups the harness vocabulary work into mergeable slices. Product truth remains in `spx/spx.product.md`, decisions, specs, tests, and source; this file records the delivery order.

## Harness vocabulary guard

Before applying this plan to agent-facing commands, docs, or session-domain boundaries, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, configured agent, agent adapter, and agent session.

Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled. Keep SPX handoff sessions, configured-agent sessions, and command actors distinct.

## Active delivery program

**Harness vocabulary entry.** Align `spx/spx.product.md`, `spx/12-agent-harness.pdr.md`, `spx/15-agent-run-journal.enabler`, `spx/33-agent-environment.enabler`, `spx/34-verification.enabler`, `spx/36-session.enabler`, `spx/38-worktree.enabler`, and `spx/46-agent.enabler` so each root affected node uses the terms harness, configured agent, agent adapter, and agent session consistently. This slice also removes stale vocabulary from the affected `PLAN.md` files.

**Harness environment contract.** Rename the configured contract owned by `spx/33-agent-environment.enabler`: `agentEnvironment` becomes `harnessEnvironment`, legacy collections become agent collections, `AgentRuntime` becomes `Agent`, and adapter naming remains separate from configured-agent naming. This slice updates specs, tests, source modules, config fixtures, generators, and examples with no compatibility aliases.

**Harness node path.** Rename `spx/33-agent-environment.enabler` with `/refactor` after the public config contract is aligned. The default target is `spx/33-harness-environment.enabler` unless `/decompose` establishes a broader root node.

**Verification and journal identity.** Align `spx/15-agent-run-journal.enabler` and `spx/34-verification.enabler` so journal records describe verification runs executed by configured agents, distinct from configured-agent sessions and SPX handoff records. Then apply the verify lifecycle child queue under `spx/34-verification.enabler/32-verify.enabler`.

**Session and worktree identity.** Align `spx/36-session.enabler`, `spx/38-worktree.enabler`, and `spx/15-worktree-management.pdr.md` so SPX handoff files, handoff records, agent sessions, and worktree holder session identity stay separate. The session accumulator implementation follows as its own slice.

**Agent resume and adapter boundary.** Align `spx/46-agent.enabler` and `spx/46-agent.enabler/21-resume.enabler` so `spx agent resume` coordinates agent-native sessions and keeps adapter implementation naming separate from configured-agent naming.

## Per-slice gates

Each slice starts from current `origin/main`, loads context with `/contextualize`, and uses `/plan-slice` when the slice is selected from this program. Structural moves use `/refactor`; implementation work uses `/apply`.

Before merge, each slice runs the matching verifier agents: `pdr-auditor` for PDR edits, `adr-auditor` for ADR edits, `spec-auditor` for changed specs, `test-evidence-auditor` for test edits, `auditor` for TypeScript source edits, and `changes-reviewer` for the whole changeset.

Local deterministic gates are `pnpm run validate`, focused `spx test spx/<node>` for changed implementation or tests, and `pnpm run build` before push when source changes. Commits go through `/commit-changes`; delivery goes through `/merge`.
