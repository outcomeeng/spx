# Delta simulation: adopt Delta coordination in SPX

This simulated **Delta** captures SPX's movement from the current Change, `PLAN.md`, and legacy queue model to the Next methodology's Delta, delta Claim, Handoff, and Note coordination model.

> **Simulation boundary:** `PLAN.md` is acting as a temporary coordination backend so we can test the Delta shape against real work. This record carries coordination only. Current SPX specs and decisions remain product truth, and the [Next coordination chapter](https://github.com/outcomeeng/methodology/blob/4be02ae5883cc6fbbab64f328daa842566180abe/versions/next/11-coordination.md) remains methodology truth.

## Record

| Field                     | Value                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Identity**              | `dlt_01K07E7M9K6Q2A4R8V3W5X1YZN`                                                                                                                                         |
| **Backend revision**      | `plan-simulation/2`                                                                                                                                                      |
| **Handle**                | `adopt-delta-coordination`                                                                                                                                               |
| **Backend-local id**      | `adopt-delta-coordination`                                                                                                                                               |
| **Locator**               | `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md#record`                                                                                                            |
| **Title**                 | Adopt Delta, delta Claim, Handoff, and Note coordination in SPX                                                                                                          |
| **Context**               | Reconcile SPX's current Change and legacy queue coordination with the adopted Next coordination model.                                                                   |
| **Movement**              | Replace mixed Change, plan, ownership, and continuation mechanisms with backend-neutral Delta coordination.                                                              |
| **Products**              | `github.com/outcomeeng/spx`                                                                                                                                              |
| **Backend status**        | `plan-simulation.archive`                                                                                                                                                |
| **Projected lifecycle**   | `archived`                                                                                                                                                               |
| **Derived claimable**     | No; archived Deltas are terminal                                                                                                                                         |
| **Declared refinement**   | `planning`                                                                                                                                                               |
| **Effective refinement**  | `planning`                                                                                                                                                               |
| **Refinement evidence**   | Reviewed anchors, constraints, and split boundaries support planning; deterministic validation remains unavailable in the simulation backend.                            |
| **Priority**              | Operator-ordered next                                                                                                                                                    |
| **Blocked by identities** | None                                                                                                                                                                     |
| **Origin**                | Operator design review reconciled through [methodology pull request #26](https://github.com/outcomeeng/methodology/pull/26)                                              |
| **Disposition**           | `carried-forward`                                                                                                                                                        |
| **Successor identities**  | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`, `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X`, `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y`, `dlt_01K07G5D1Q5R7S9T1V3W5X7Y9Z`, `dlt_01K07G5E2R6S8T0V2W4X6Y8Z0A` |
| **Next step**             | Empty; continuation moved to the named successors                                                                                                                        |

## Movement

The current product represents planned movement through backend-neutral Change records, distributed `PLAN.md` files, and the legacy queue under `.spx/sessions/`. Its persisted operational continuation and ownership concerns are spread across the Change, state, legacy queue, agent adapter, worktree, and command-line interface areas.

The intended displacement gives SPX one backend-neutral coordination model:

- **Delta** carries future product movement and replaces mutable planning in `PLAN.md`.
- **Delta Claim** carries fenced global ownership and observable liveness for one Delta.
- **Handoff** carries persisted, transient operational continuation across conversations, worktrees, hosts, and takeover.
- **Note** keeps node-local known defects and gaps in `ISSUES.md` using Evidence, Impact, and Settlement.

## Anchors

- `github.com/outcomeeng/spx::spx/25-outcomeeng.enabler/31-changes.enabler`
- `github.com/outcomeeng/spx::spx/18-state.enabler`
- `github.com/outcomeeng/spx::spx/36-session.enabler`
- `github.com/outcomeeng/spx::spx/38-worktree.enabler`
- `github.com/outcomeeng/spx::spx/46-agent.enabler`
- `github.com/outcomeeng/spx::spx/60-surfaces.enabler`

## Governing sources

- [Next coordination](https://github.com/outcomeeng/methodology/blob/4be02ae5883cc6fbbab64f328daa842566180abe/versions/next/11-coordination.md) defines the backend-neutral coordination artifacts and their lifecycle.
- [Next operational concerns](https://github.com/outcomeeng/methodology/blob/4be02ae5883cc6fbbab64f328daa842566180abe/versions/next/10-operational-concerns.md) separates persistence, delivery, and backend.
- [spx/25-outcomeeng.enabler/31-changes.enabler/21-change-store.pdr.md](21-change-store.pdr.md) and [spx/25-outcomeeng.enabler/31-changes.enabler/changes.md](changes.md) remain current SPX truth until governed authoring replaces the Change model.
- [spx/12-agent-harness.pdr.md](../../12-agent-harness.pdr.md) keeps agent, agent adapter, and provider-owned conversation state distinct from SPX coordination.

## Refinement packet

| Area                        | Adoption constraint                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vocabulary**              | SPX coordination uses Delta, delta Claim, Handoff, and Note. Provider rollout, transcript, and line-delimited records remain provider-owned artifacts.                                                                                                                                                                                                        |
| **Delta identity**          | A product-minted immutable opaque identity survives backend and locator changes. Backend-local id, locator, and human handle remain separate fields.                                                                                                                                                                                                          |
| **Delta shape**             | Shared fields cover title, context, next step, refinement, product identities, product-qualified node anchors, priority, blockers, origin, backend-qualified status, disposition, and successors.                                                                                                                                                             |
| **Refinement**              | The refiner declares `intent`, `planning`, or `implementation`. Deterministic validation lowers stale readiness when anchors, blockers, or governing context invalidate the declaration.                                                                                                                                                                      |
| **Composition**             | Split and coalesce archive originals as `carried-forward`, name successors, and re-anchor dependent blockers through the successor mapping. Terminal dispositions are `applied`, `carried-forward`, and `abandoned`.                                                                                                                                          |
| **Backend floor**           | Every writable backend provides revision-checked single-Delta create, update, claim, and archive mutations. Lower-capability adapters are read-only; multi-record transactions are optional.                                                                                                                                                                  |
| **First Delta persistence** | Committed Git state on the default branch uses an observed-tip compare-and-set. A failed publication re-reads the tip and reapplies the semantic mutation before retrying.                                                                                                                                                                                    |
| **Claim authority**         | Ownership is global liveness rather than host-local worktree occupancy. Every transition is a structured backend operation, and takeover is serialized against the current claim revision.                                                                                                                                                                    |
| **GitHub Claim backend**    | A fenced claim branch and draft pull request (PR) represent the first backend. The PR description carries the active Claim identity and lease projection. A valid owner heartbeat or fenced branch-head advance renews liveness; 24 hours without either marks the Claim dead.                                                                                |
| **GitHub fencing**          | Claim creation and takeover advance the claim ref through compare-and-set commits. History-rewriting pushes use an explicit expected remote object identity with `--force-with-lease`. PR comments are mutable operator logs, and committed records carry durable history.                                                                                    |
| **Handoff core**            | Handoff requires Delta identity, Claim identity, git ref, and next action. Extensible typed observations carry completed work, evidence, decisions, blockers, and hazards. Secret values and credential payloads are rejected; references, status, and remediation are allowed.                                                                               |
| **Handoff retention**       | Acknowledgement records proof of reading and preserves the carrier. The successor's own Handoff supersedes it, or Delta terminalization removes it. Claim death and takeover preserve it, and a non-terminal Delta prevents expiry.                                                                                                                           |
| **Handoff on GitHub**       | A typed blob lives in a fenced claim-branch commit. A compare-and-set mutation records acknowledgement, a successor commit replaces the blob, and the PR body projects operator-readable context.                                                                                                                                                             |
| **Notes**                   | `ISSUES.md` entries contain exactly Evidence, Impact, and Settlement. They contain no plan, action, priority, owner, status, sequencing, next step, or Delta reference.                                                                                                                                                                                       |
| **Migration**               | Valid planning becomes Deltas, live operational continuation becomes Handoffs, strict defects and gaps remain Notes, and stale text is discarded with an audited migration record. One governed cutover removes `.spx/sessions`, legacy queue files, `spx session`, `PLAN.md`, and every old reader and writer without aliases, read bridges, or dual writes. |

## Schema findings

The first refinement pass separates stored coordination data from backend metadata, derived projections, terminal extensions, and related artifacts.

| Field class              | Fields                                                                                                                                                                                         | Simulation result                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stored Delta core**    | Identity, handle, title, context, movement, next step, products, anchors, declared refinement, effective refinement, refinement evidence, priority, blocker identities, origin, backend status | Present on every live record and retained after archival.                                                                                                       |
| **Backend metadata**     | Backend revision, backend-local id, locator                                                                                                                                                    | Exposed for compare-and-set and lookup without becoming backend-neutral identity.                                                                               |
| **Derived projection**   | Shared lifecycle and claimability                                                                                                                                                              | Computed from backend status, blockers, and blocker dispositions; never independently mutated.                                                                  |
| **Terminal extension**   | Disposition and successor identities                                                                                                                                                           | Present only when lifecycle projects to `archived`.                                                                                                             |
| **Separate artifact**    | Delta Claim and Handoff                                                                                                                                                                        | Addressed beside the Delta through their own identities and revisions; absent from the Delta field set.                                                         |
| **Physical granularity** | One independently addressable record per Delta                                                                                                                                                 | The six-record Markdown simulation is readable but repetitive and cannot provide per-record compare-and-set. A production backend stores each Delta separately. |

## Claim projection

Claims remain separate records. The simulation backend exposes their absence as a projection instead of embedding a Claim field in each Delta.

| Delta identity                   | Claim | Reason                                                               |
| -------------------------------- | ----- | -------------------------------------------------------------------- |
| `dlt_01K07E7M9K6Q2A4R8V3W5X1YZN` | None  | The parent split before execution.                                   |
| `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W` | None  | The simulation backend cannot fence ownership or establish liveness. |
| `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X` | None  | The Delta is blocked.                                                |
| `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y` | None  | The Delta is blocked.                                                |
| `dlt_01K07G5D1Q5R7S9T1V3W5X7Y9Z` | None  | The Delta is blocked.                                                |
| `dlt_01K07G5E2R6S8T0V2W4X6Y8Z0A` | None  | The Delta is blocked.                                                |

## Executed split

The parent is archived as `carried-forward`. Each successor has an immutable identity and an independent lifecycle.

| Identity                         | Handle                         | Depends on                                                                                                                             |
| -------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W` | `adopt-coordination-model`     | None                                                                                                                                   |
| `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X` | `persist-deltas-in-git`        | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`                                                                                                       |
| `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y` | `claim-deltas-through-github`  | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`, `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X`                                                                     |
| `dlt_01K07G5D1Q5R7S9T1V3W5X7Y9Z` | `persist-claim-handoffs`       | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`, `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y`                                                                     |
| `dlt_01K07G5E2R6S8T0V2W4X6Y8Z0A` | `cut-over-legacy-coordination` | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`, `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X`, `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y`, `dlt_01K07G5D1Q5R7S9T1V3W5X7Y9Z` |

## Successor records

### Adopt the coordination model

| Field                     | Value                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Identity**              | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`                                                                                                     |
| **Backend revision**      | `plan-simulation/1`                                                                                                                  |
| **Handle**                | `adopt-coordination-model`                                                                                                           |
| **Backend-local id**      | `adopt-coordination-model`                                                                                                           |
| **Locator**               | `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md#adopt-the-coordination-model`                                                  |
| **Title**                 | Adopt the coordination model                                                                                                         |
| **Context**               | Current SPX truth uses Change and legacy queue vocabulary while methodology Next defines Delta coordination.                         |
| **Movement**              | Replace the current Change contract with durable Delta, delta Claim, Handoff, and Note semantics.                                    |
| **Products**              | `github.com/outcomeeng/spx`                                                                                                          |
| **Origin**                | Split from `dlt_01K07E7M9K6Q2A4R8V3W5X1YZN`                                                                                          |
| **Backend status**        | `plan-simulation.available`                                                                                                          |
| **Projected lifecycle**   | `available`                                                                                                                          |
| **Derived claimable**     | Yes; every blocker is satisfied                                                                                                      |
| **Declared refinement**   | `planning`                                                                                                                           |
| **Effective refinement**  | `planning`                                                                                                                           |
| **Refinement evidence**   | The vocabulary, boundaries, anchors, and migration semantics are reviewed; durable SPX decisions and aligned specs remain unwritten. |
| **Priority**              | 1                                                                                                                                    |
| **Blocked by identities** | None                                                                                                                                 |
| **Anchors**               | `spx/25-outcomeeng.enabler`, `spx/25-outcomeeng.enabler/31-changes.enabler`                                                          |
| **Next step**             | Author the product and architecture decisions, then align the first affected specs.                                                  |

### Persist Deltas in Git

| Field                     | Value                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Identity**              | `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X`                                                                                             |
| **Backend revision**      | `plan-simulation/1`                                                                                                          |
| **Handle**                | `persist-deltas-in-git`                                                                                                      |
| **Backend-local id**      | `persist-deltas-in-git`                                                                                                      |
| **Locator**               | `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md#persist-deltas-in-git`                                                 |
| **Title**                 | Persist Deltas in Git                                                                                                        |
| **Context**               | SPX needs durable, cross-machine Delta history before hosted Claim coordination can rely on stable records.                  |
| **Movement**              | Define the backend-neutral store contract and the observed-tip Git backend for Delta history.                                |
| **Products**              | `github.com/outcomeeng/spx`                                                                                                  |
| **Origin**                | Split from `dlt_01K07E7M9K6Q2A4R8V3W5X1YZN`                                                                                  |
| **Backend status**        | `plan-simulation.available`                                                                                                  |
| **Projected lifecycle**   | `available`                                                                                                                  |
| **Derived claimable**     | No; a blocker remains non-terminal                                                                                           |
| **Declared refinement**   | `planning`                                                                                                                   |
| **Effective refinement**  | `planning`                                                                                                                   |
| **Refinement evidence**   | The mutation floor and Git compare-and-set policy are reviewed; serialization, layout, and retry evidence remain unresolved. |
| **Priority**              | 2                                                                                                                            |
| **Blocked by identities** | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`                                                                                             |
| **Anchors**               | `spx/25-outcomeeng.enabler/31-changes.enabler`, `spx/18-state.enabler`                                                       |
| **Next step**             | Settle record serialization, default-branch layout, revision tokens, and semantic retry evidence.                            |

### Claim Deltas through GitHub

| Field                     | Value                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity**              | `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y`                                                                                                                   |
| **Backend revision**      | `plan-simulation/1`                                                                                                                                |
| **Handle**                | `claim-deltas-through-github`                                                                                                                      |
| **Backend-local id**      | `claim-deltas-through-github`                                                                                                                      |
| **Locator**               | `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md#claim-deltas-through-github`                                                                 |
| **Title**                 | Claim Deltas through GitHub                                                                                                                        |
| **Context**               | Cross-machine execution needs one observable live owner and deterministic takeover using the existing merge provider.                              |
| **Movement**              | Implement fenced Claim branches, draft PR projection, heartbeat qualification, 24-hour death, takeover, and explicit expected-object pushes.       |
| **Products**              | `github.com/outcomeeng/spx`                                                                                                                        |
| **Origin**                | Split from `dlt_01K07E7M9K6Q2A4R8V3W5X1YZN`                                                                                                        |
| **Backend status**        | `plan-simulation.available`                                                                                                                        |
| **Projected lifecycle**   | `available`                                                                                                                                        |
| **Derived claimable**     | No; blockers remain non-terminal                                                                                                                   |
| **Declared refinement**   | `planning`                                                                                                                                         |
| **Effective refinement**  | `planning`                                                                                                                                         |
| **Refinement evidence**   | Liveness signals, death threshold, fencing, takeover, and delivery boundaries are reviewed; transition schemas and verification remain unresolved. |
| **Priority**              | 3                                                                                                                                                  |
| **Blocked by identities** | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`, `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X`                                                                                 |
| **Anchors**               | `spx/38-worktree.enabler`, `spx/46-agent.enabler`, `spx/60-surfaces.enabler`                                                                       |
| **Next step**             | Separate backend persistence from operator delivery and specify every compare-and-set transition.                                                  |

### Persist Claim Handoffs

| Field                     | Value                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity**              | `dlt_01K07G5D1Q5R7S9T1V3W5X7Y9Z`                                                                                                                      |
| **Backend revision**      | `plan-simulation/1`                                                                                                                                   |
| **Handle**                | `persist-claim-handoffs`                                                                                                                              |
| **Backend-local id**      | `persist-claim-handoffs`                                                                                                                              |
| **Locator**               | `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md#persist-claim-handoffs`                                                                         |
| **Title**                 | Persist Claim Handoffs                                                                                                                                |
| **Context**               | A successor needs operational continuation that survives acknowledgement, Claim death, host loss, and takeover.                                       |
| **Movement**              | Implement the typed Handoff carrier, acknowledgement, replacement, takeover inheritance, retention, and secret boundary.                              |
| **Products**              | `github.com/outcomeeng/spx`                                                                                                                           |
| **Origin**                | Split from `dlt_01K07E7M9K6Q2A4R8V3W5X1YZN`                                                                                                           |
| **Backend status**        | `plan-simulation.available`                                                                                                                           |
| **Projected lifecycle**   | `available`                                                                                                                                           |
| **Derived claimable**     | No; blockers remain non-terminal                                                                                                                      |
| **Declared refinement**   | `planning`                                                                                                                                            |
| **Effective refinement**  | `planning`                                                                                                                                            |
| **Refinement evidence**   | Core fields, observations, acknowledgement, replacement, retention, and secret boundaries are reviewed; extension and blob schemas remain unresolved. |
| **Priority**              | 4                                                                                                                                                     |
| **Blocked by identities** | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`, `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y`                                                                                    |
| **Anchors**               | `spx/36-session.enabler`, `spx/46-agent.enabler`, `spx/60-surfaces.enabler`                                                                           |
| **Next step**             | Settle observation extension rules and the claim-branch blob schema.                                                                                  |

### Cut over legacy coordination

| Field                     | Value                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity**              | `dlt_01K07G5E2R6S8T0V2W4X6Y8Z0A`                                                                                                         |
| **Backend revision**      | `plan-simulation/1`                                                                                                                      |
| **Handle**                | `cut-over-legacy-coordination`                                                                                                           |
| **Backend-local id**      | `cut-over-legacy-coordination`                                                                                                           |
| **Locator**               | `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md#cut-over-legacy-coordination`                                                      |
| **Title**                 | Cut over legacy coordination                                                                                                             |
| **Context**               | Legacy plans and queue records mix planning, continuation, defects, and stale text across incompatible authorities.                      |
| **Movement**              | Partition legacy content, migrate live coordination, retain strict Notes, and remove every legacy queue and plan surface in one release. |
| **Products**              | `github.com/outcomeeng/spx`                                                                                                              |
| **Origin**                | Split from `dlt_01K07E7M9K6Q2A4R8V3W5X1YZN`                                                                                              |
| **Backend status**        | `plan-simulation.available`                                                                                                              |
| **Projected lifecycle**   | `available`                                                                                                                              |
| **Derived claimable**     | No; blockers remain non-terminal                                                                                                         |
| **Declared refinement**   | `planning`                                                                                                                               |
| **Effective refinement**  | `planning`                                                                                                                               |
| **Refinement evidence**   | Partition and cutover rules are reviewed; the complete inventory and audited discard record remain unresolved.                           |
| **Priority**              | 5                                                                                                                                        |
| **Blocked by identities** | `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W`, `dlt_01K07G5B9N3P5Q7R9S1T3V5W7X`, `dlt_01K07G5C0P4Q6R8S0T2V4W6X8Y`, `dlt_01K07G5D1Q5R7S9T1V3W5X7Y9Z`   |
| **Anchors**               | `spx/`, `spx/36-session.enabler`, `spx/60-surfaces.enabler`                                                                              |
| **Next step**             | Inventory every `PLAN.md`, queue record, command, reader, writer, prompt, and instruction before removal.                                |

## Active scope

| Current path                                           | Target receiver                  | Next edit                                                                           | Prerequisite                                                         | Verification                                                      |
| ------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md` | Unnumbered `coordination.domain` | Refine `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W` toward durable decision and spec authoring. | Review the first successor's semantic boundary and durable receiver. | Markdown validation, projection audit, PDR audit, and spec audit. |

## Parked scope

| Area                           | Reason                                                                                                                                   | Re-entry condition                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable Objects backend        | GitHub is the first Claim backend; a hosted authority adds another availability and trust boundary.                                      | Re-enter when GitHub claim latency, contention, tenancy, or availability evidence requires a serialized hosted authority.                          |
| Final target paths and indices | Current SPX supports `.enabler` and `.outcome`; candidate successor receivers still need independent projection and dependency evidence. | Re-enter after configured Next kinds and methodology context injection are implemented and each successor has a reviewed receiver.                 |
| Implementation                 | Every successor remains at `planning` refinement.                                                                                        | Re-enter per successor after its durable decisions, receivers, verification route, and deterministic refinement evidence support `implementation`. |
| Provider conversation storage  | Provider rollout, transcript, and line-delimited persistence belong to each provider.                                                    | Re-enter only at an adapter boundary that consumes or produces a Handoff without importing provider storage into SPX coordination.                 |

## What this simulation teaches

- Markdown can carry readable Delta packets, stable identities, anchors, refinement, blockers, composition history, and successor records.
- `PLAN.md` cannot enforce identity uniqueness, revision-checked mutation, global discovery, Claim liveness, takeover fencing, or archive consistency.
- One file becomes awkward as soon as a parent splits, which supports one independently addressable record per Delta.
- Declared and effective refinement need separate fields so deterministic invalidation can lower readiness without erasing the refiner's judgment.
- Backend-qualified status and the shared lifecycle need separate fields so native labels remain visible without changing selection semantics.
- Claim and Handoff references belong to related-artifact projections rather than the Delta core.
- Disposition and successor identities form an archived-record extension rather than empty fields repeated on every live Delta.

## Verification route

1. Run `tsx src/cli.ts validation markdown spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md`.
2. Review the record against the pinned Next coordination chapter and the current SPX decisions.
3. Verify that every successor blocker names an immutable identity and follows the selected dependency order.
4. Refine `dlt_01K07G5A8M2N4P6Q8R0S2T4V6W` without raising it above `planning` until durable decisions and specs exist.
5. Author durable SPX decisions and specs for the first successor before implementation.
