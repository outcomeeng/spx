# Open Issues

## `spx spec status` offers no path scope and no direct per-node record lookup

`spx spec status` declares no positional operand. Its usage line is `spx spec status [options]` with `--json`, `--format`, `--update`, and `-h`, so a caller naming a node — `spx spec status spx/36-session.enabler` — has the argument silently ignored and receives the whole tree.

[`spx/29-verification-path-scope.pdr.md`](../29-verification-path-scope.pdr.md) names status refresh in the operand vocabulary it shares across validation, testing, and verification launchers, and forbids introducing a scope flag where positional operands express the same product path scope. Against that decision the two halves of this command differ:

- `spx spec status --update` is status refresh, which the decision names directly. Refreshing every node's recorded evidence with no way to narrow by product path is a discrepancy against it.
- `spx spec status` without `--update` exposes no path-scoped execution at all, so the decision's testing rules do not bind it today. Adding scope there is coverage the decision would then govern, not a contradiction it currently records.

The projection has a second, independent shape gap. `--json` returns `{version, product, nodes, decisions}` where `nodes` is a recursive tree of `{id, kind, order, slug, state, children}` and `id` is a tree-relative path such as `13-cli.enabler/21-cli-subprocess-test-harness.enabler`. A caller resolving one node by that id must descend `children` itself; no flat index and no by-id retrieval is offered.

**Impact:** a consumer wanting one node's state pays for the whole projection and reimplements the descent. A consumer that assumes the operand is honoured silently reads whole-tree output as though it were scoped.

**Ownership caveat:** [`PLAN.md`](PLAN.md) records that this node does not own CLI verbs, flags, or help text, and that the CLI wrapper migrates to `spx/60-surfaces.enabler`. Both halves of this gap sit under `spx/31-spec-domain.enabler` in the current tree — the operand contract at [`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler`](54-spec-cli-commands.enabler/spec-cli-commands.md) and the projection shape at [`spx/31-spec-domain.enabler/21-node-status.enabler`](21-node-status.enabler/node-status.md) — so the entry is recorded here and follows the wrapper if the migration moves it.

**Resolution:** admit zero or more positional product path operands on `spx spec status`, resolving them before any surface-specific filter and preserving unscoped execution when none are supplied, per [`spx/29-verification-path-scope.pdr.md`](../29-verification-path-scope.pdr.md). Expose a direct per-node record lookup by tree-relative id — or a flat node index beside the tree — so a caller retrieves one record without walking `children`. Introduce no `--node` or `--nodes` flag; the decision forbids a path-scope flag where operands express the same scope.

**Consumer awaiting this:** [`spx/36-session.enabler/54-session-reconciliation.enabler`](../36-session.enabler/54-session-reconciliation.enabler/session-reconciliation.md) reserves a node-status reference kind that stays undeclared until this lookup exists.
