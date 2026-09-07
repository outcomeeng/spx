# Issues: spx verification `<type> run` command surface

> Coordination note, not product truth. Reconcile against `execute-run.md`, the executor spec
> `spx/34-verification.enabler/43-execute.enabler/execute.md`, and the TypeScript descriptor
> `spx/41-test.enabler/21-typescript-test.enabler/typescript-test.md` before acting. The
> family-level list in `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/ISSUES.md`
> carries every remaining issue for this family; this note keeps only what is local to this node.

## The command paths are unwired and the evidence links are broken

`execute-run.md` links its three `[compliance]` assertions to `tests/execute-run.compliance.l1.test.ts`,
which does not exist, and `src/interfaces/cli/verify.ts` registers no `spx verification <type> run`
path. The node stays in `spx/EXCLUDE` until the `/apply` that wires the command path also writes
that evidence, removes the exclusion, and regenerates the committed status through the projector.

The runner-resolution gap that used to block a shipped `spx` from driving the `test` type is
closed: the descriptor's journal-streaming run resolves the Vitest Node API from the product
directory under test and reports a runnerless product as its own outcome
(`spx/41-test.enabler/21-typescript-test.enabler/typescript-test.md`, Vitest-resolution compliance
assertions). What this surface still owes is the diagnostic that carries the searched product
directory to the caller; the executor fold that currently erases that outcome is recorded at the
family level.
