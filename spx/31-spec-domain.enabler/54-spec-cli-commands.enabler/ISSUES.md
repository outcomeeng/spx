# Issues: 54-spec-cli-commands.enabler

## FOLLOW-UP: spx spec next does not read persisted node status

`spx spec status` reports a node's committed `spx.status.json` (read-back), but `spx spec next` (`src/commands/spec/next.ts`) selects the first non-passing node from live structural derivation only — it passes no evidence provider to `readSpecTree`. After `spx spec status --update` writes status files, `status` and `next` can disagree: `status` reports a node as `passing` from its recorded file while `next` re-flags it as non-passing from live derivation. `spec-cli-commands.md` asserts read-back only for `spx spec status`, so this is a spec question, not an implementation defect.

**Resolution:** decide whether `spx spec next` should honor persisted node status; if so, add a `next` read-back assertion to `spec-cli-commands.md` and wire `createNodeStatusProvider` into `nextCommand`.

**Skills:** `spec-tree:authoring` (spec decision), `spec-tree:applying` (implementation).

## FOLLOW-UP: broaden read-back evidence to every overridable live state

The read-back scenario test (`tests/spec-cli-commands.scenario.l1.test.ts`) proves a committed `spx.status.json` overrides a live-derived `specified` state. It does not exercise override of `declared` (no co-located evidence) or `failing` (evidence present, recorded non-passing). Scenario 6 is typed as a Scenario ("there exists"), so one representative override is sufficient evidence; broadening to every overridable live state would retype the assertion as a Mapping over a finite set.

**Resolution:** if stronger evidence is wanted, retype the read-back scenario in `spec-cli-commands.md` as a Mapping over the overridable live states (`declared`, `specified`, `failing`) and cover each in `tests/spec-cli-commands.mapping.l1.test.ts`.

**Skills:** `spec-tree:authoring` (assertion retype), `typescript:testing-typescript` (tests).

## FOLLOW-UP: status read-back reads one spx.status.json per node synchronously

Wiring `createNodeStatusProvider` into `spx spec status` adds one synchronous `readNodeStatus` (`src/lib/node-status/read.ts`, `readFileSync`) per node, because `SpecTreeEvidenceProvider.stateForNode` (`src/lib/spec-tree/index.ts`) is a synchronous interface the node-status architecture ADR mandates. For a large spec tree this is one blocking read per node within `readSpecTree`. Each read is a small JSON file (most absent until `--update` runs), so the cost is expected to stay within the under-100ms CLI budget in `spx/spx.product.md`, but it is unmeasured.

**Resolution:** if the latency budget is ever threatened, either make `SpecTreeEvidenceProvider.stateForNode` async (and update `deriveState`/`readSpecTree`) or have the provider factory pre-read every `spx.status.json` in one async pass into an in-memory map the synchronous `stateForNode` consults. Both touch the spec-tree provider interface, so the change is governed by `spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`.

**Skills:** `spec-tree:applying` (implementation), `typescript:architecting-typescript` (interface change).
