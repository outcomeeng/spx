# Plan

## Reserved reference coverage: node status

The declared assertions cover the two recorded reference kinds a session carries directly — the `git_ref` branch and the `specs` and `files` entries. A third reference kind is reserved for this node and not yet declared: the spec-node status behind each `specs` entry, where the entry's parent directory names a node whose current state the caller wants reconciled against the session's assumptions.

That coverage is blocked on a surface gap outside this node. `spx spec status` accepts no positional product path operand and its JSON projection exposes node records only through a recursive `children` tree, so a caller resolving one node by tree-relative id must walk the whole projection. The gap is recorded against its owning node in [`spx/31-spec-domain.enabler/ISSUES.md`](../../31-spec-domain.enabler/ISSUES.md).

Declare the node-status reference kind here once that surface admits a path operand and a direct per-node record lookup. Adding a reference kind is additive: the mapping assertions gain a row, and the totality property already quantifies over whatever reference set a session carries.

## Steps to first evidence

1. Write the declared mapping, property, and compliance evidence through `/apply`, using the temp-product-directory environment of [`spx/22-test-environment.enabler`](../../22-test-environment.enabler/test-environment.md) and the session fixtures of [`spx/36-session.enabler/21-session-test-harness.enabler`](../21-session-test-harness.enabler/session-test-harness.md) — real directories under a temp root, no filesystem mocking, per [`spx/12-test-infrastructure.adr.md`](../../12-test-infrastructure.adr.md).
2. Compose the implementation across the three layers of [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md): pure verdict resolution under `src/domains/session/`, the handler under `src/commands/session/`, and the `reconcile` Commander binding under `src/interfaces/cli/`, owned by [`spx/36-session.enabler/76-session-cli.enabler`](../76-session-cli.enabler/session-cli.md).
3. Remove this node's entry from `spx/EXCLUDE` and regenerate the committed status through the projector — never by hand-writing an outcome value.
