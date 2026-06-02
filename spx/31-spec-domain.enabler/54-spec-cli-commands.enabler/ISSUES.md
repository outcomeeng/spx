# Issues: 54-spec-cli-commands.enabler

## Open: forward-contract test links pending the status/testing reconciliation

`spec-cli-commands.md` carries `[test](tests/spec-cli-commands.scenario.l1.test.ts)` links on the `spx spec status --update` write scenario and the no-tests read scenario whose covering test cases are not yet authored — they are forward contracts.

The status and testing responsibility reconciliation planned in `spx/PLAN.md` will revise these scenarios: status will consume testing's recorded evidence and delegate the per-node run to testing rather than running tests itself, and `spx spec status --update` (declared but unwired on `main`) will be implemented. The covering tests follow the reconciled spec, authored in the implementation unit per that cascade.

**Skills:** `spec-tree:authoring` (spec revision), `spec-tree:applying` (implementation).
