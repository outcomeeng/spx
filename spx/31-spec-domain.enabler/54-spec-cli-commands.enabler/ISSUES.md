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

## Composed terminal text carries no node-local escaping evidence

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node composes through that primitive and resolves each command's output to one of the two kinds the decision declares. It carries no co-located evidence of its own that either claim holds at its surface.

**Resolved sites:**

- `src/interfaces/cli/spec.ts` — `writeOutput` and the error handler — node directory names, traversal warnings, and caught-error messages embedding the argv target, composed and escaped
- `src/interfaces/cli/spec.ts` — `spec context show` without `--json` — the manifest is a report the product composes, so its `Targets`, `Product root`, and `Methodology` labels are authored while the argv operands and node paths beside them are escaped where they are embedded
- `src/interfaces/cli/spec.ts` — `spec context show --json` — the bundle is data for a machine, and with `--content` it carries each read document's exact bytes, so it relays byte-for-byte through the pass-through channel
- `src/interfaces/cli/spec.ts` — the `--understand` methodology tail — each methodology body is a document read for its exact bytes, so it relays on its own write after the composed manifest rather than mixing the two claims in one write

**Impact:** both claims rest on the primitive's own evidence under [`spx/13-cli.enabler`](../../13-cli.enabler/cli.md). A later change that hands a finished string to the composed write, or relays a composed report, fails nothing this node owns, because `spx/no-unescaped-terminal-text` reports a value embedded in a write argument and cannot see a bare identifier handed to one.

**Resolution:** add this node's compliance assertion and co-located evidence that a control-byte-bearing traversal warning renders escaped while a context bundle's bytes reach standard output unchanged. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the composed-side shape.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## The context format switch duplicates the descriptor's own branch

`contextOutputForFormat` in [`src/interfaces/cli/spec.ts`](../../../src/interfaces/cli/spec.ts) routes a named format to its renderer and flattens the composed text form to a plain string. The descriptor no longer calls it — the two formats travel different channels at the write site, so the action selects a renderer directly. Only tests reach the function.

**Impact:** two implementations of one routing decision. The descriptor's channel selection can change without the switch following, and a test asserting through the switch then proves a path production no longer takes.

**Resolution:** retarget its tests at `contextReport` and `contextDocument`, which are what the descriptor calls, then remove the switch.

**Skills:** `/test-typescript`, `/apply`.
