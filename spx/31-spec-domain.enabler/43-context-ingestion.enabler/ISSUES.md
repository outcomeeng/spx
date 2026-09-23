# Open Issues

## Six compliance cases attribute a child node's behavior to this node's result

`tests/context-ingestion.compliance.l1.test.ts` carries nine cases under the Compliance assertion `Context ingestion resolves the complete projection before output and emits no partial result after any target, source, citation, or methodology failure`. Six of them — the suffix-component case, the shared-suffix ambiguity case, the descendant-disambiguation case, the untracked-scratch exclusion case, the linked-worktree-root case, and the missing-node-spec case — exercise target resolution and read-set selection rather than the no-partial-output claim. The first three duplicate the linked evidence of [`spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler`](43-target-resolution.enabler/target-resolution.md) case for case, over the same `specContextAmbiguousNestedDirectory` fixture and the same ambiguity diagnostic and candidate assertions. The assertion's own clauses are carried by `tests/context-ingestion.compliance.l2.test.ts`.

**Evidence:** the test-evidence audit of this node at `17d30b2a9` returned `APPROVED` with finding `f-001`, severity warning, against `tests/context-ingestion.compliance.l1.test.ts`.

**Impact:** a defect in target resolution or read-set selection fails this node's compliance result, so the recorded outcome names the wrong node.

**Settlement condition:** each case asserts a clause of the assertion it is linked to, and every target-resolution and read-set case belongs to the node whose contract it exercises — [`spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler`](43-target-resolution.enabler/target-resolution.md) or [`spx/31-spec-domain.enabler/43-context-ingestion.enabler/54-read-set-projection.enabler`](54-read-set-projection.enabler/read-set-projection.md) — with no case duplicated across the two files.
