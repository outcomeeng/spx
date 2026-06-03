# Issues: 54-spec-cli-commands.enabler

## Open: forward-contract test links pending the status/testing delegation

`spec-cli-commands.md` carries `[test](tests/spec-cli-commands.scenario.l1.test.ts)` links on the `spx spec status --update` write scenario and the stale/failing/absent-evidence delegation scenario whose covering test cases are not yet authored — they are forward contracts. The read-back scenario (a committed `spx.status.json` surfacing through `spx spec status` without `--update`) is covered by `tests/spec-cli-commands.scenario.l1.test.ts` ("reports a node's committed spx.status.json state instead of re-deriving it"), with `statusCommand` wiring `createNodeStatusProvider` into the filesystem read path. The delegation scenario is `l1`-verifiable through the dependency-injected node-outcome resolver mandated by `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`. The remaining covering tests are authored when `spx spec status --update` is wired to the testing-evidence-plus-registry resolver.

**Skills:** `spec-tree:applying` (implementation), `typescript:testing-typescript` (tests).

## FOLLOW-UP: spx spec next does not read persisted node status

`spx spec status` reports a node's committed `spx.status.json` (read-back), but `spx spec next` (`src/commands/spec/next.ts`) selects the first non-passing node from live structural derivation only — it passes no evidence provider to `readSpecTree`. After `spx spec status --update` writes status files, `status` and `next` can disagree: `status` reports a node as `passing` from its recorded file while `next` re-flags it as non-passing from live derivation. `spec-cli-commands.md` asserts read-back only for `spx spec status`, so this is a spec question, not an implementation defect.

**Resolution:** decide whether `spx spec next` should honor persisted node status; if so, add a `next` read-back assertion to `spec-cli-commands.md` and wire `createNodeStatusProvider` into `nextCommand`.

**Skills:** `spec-tree:authoring` (spec decision), `spec-tree:applying` (implementation).

## FOLLOW-UP: broaden read-back evidence to every overridable live state

The read-back scenario test (`tests/spec-cli-commands.scenario.l1.test.ts`) proves a committed `spx.status.json` overrides a live-derived `specified` state. It does not exercise override of `declared` (no co-located evidence) or `failing` (evidence present, recorded non-passing). Scenario 6 is typed as a Scenario ("there exists"), so one representative override is sufficient evidence; broadening to every overridable live state would retype the assertion as a Mapping over a finite set.

**Resolution:** if stronger evidence is wanted, retype the read-back scenario in `spec-cli-commands.md` as a Mapping over the overridable live states (`declared`, `specified`, `failing`) and cover each in `tests/spec-cli-commands.mapping.l1.test.ts`.

**Skills:** `spec-tree:authoring` (assertion retype), `typescript:testing-typescript` (tests).
