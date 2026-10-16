---
id: 01a14536-4a23-785f-8479-497b84459b47
---

# Scope Reconciliation

PROVIDES reconciliation of a changeset run's recorded change inventory, bound expectations, and recorded scope evidence against the inventory its changeset selector resolves to, reporting the unaccounted, unexpected, and drifted paths as one structured result
SO THAT the terminal projection of a bound run and any caller driving a run
CAN learn whether every path the run was expected to judge was judged, and which paths were judged without being expected or changed since the run started

## Assertions

- Reconciliation maps a changeset run's expected entries — every entry of its recorded change inventory and each additional path its bound expectations declare — and the judged files its recorded scope evidence names in `judgedPaths` and the judged deletions it names in `judgedDeletions` to the `unaccounted` set of expected entries no judged file accounts for when the head holds the path and no judged deletion accounts for when the inventory lists the path as deleted, the `unexpected` set of judged paths outside the expected entries, and the `drifted` set of change entries in exactly one of the recorded change inventory and the inventory the run's changeset selector resolves to at reconciliation, and reports one result whose `unaccounted` and `unexpected` fields list paths, whose `drifted` field lists change entries each naming the inventory that holds it as `recorded` or `resolved`, every list in ordinal path order, and whose `reconciled` field is true exactly when all three lists are empty
- For every recorded change inventory, bound expectations, recorded scope-evidence prefix, and resolved inventory, the reconciliation result is a function of those four inputs alone: neither the order of scope events, a path judged by several scope events, a scope unit's coverage state, a finding, nor working-tree content changes it
- For every bound expectations document, the expected entries include every entry of the recorded change inventory, so expectations never remove a changed path
- ALWAYS: reconciliation rejects a run that is not changeset-scoped, a run that recorded no change inventory, and a changeset selector that no longer resolves, naming the scope type, the missing inventory, or the selector
- NEVER: reconciliation appends a journal event, seals a run, or changes the working tree, the index, or a ref
