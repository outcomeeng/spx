# Open Issues

## Tracked-content scoping and the linked-worktree root carry no linked context evidence

`spx spec context list` and `show` read only the tracked `spx/` tree of the worktree they run in: an untracked node-shaped directory beside tracked nodes stays out of the manifest, and an invocation from a nested directory of a linked worktree resolves that worktree's own root. Those two behaviors were evidenced by cases filed under this node's no-partial-output compliance assertion, which neither exercises; the cases were removed from that file, and no assertion of this node or of [`spx/31-spec-domain.enabler/43-context-ingestion.enabler/54-read-set-projection.enabler`](54-read-set-projection.enabler/read-set-projection.md) declares them. The spec-domain compliance rule "operate on tracked `spx/` files using the worktree-local root" and the product rule "ingest spec-tree context deterministically from the tracked `spx/` tree" govern them as `[audit]` assertions only.

A tracked node directory whose spec file is missing contributes no spec entry to `show`. `tests/context-ingestion.scenario.l1.test.ts` evidences that under the targetless and targeted `show` scenarios, over a top-level sibling, a depth-two sibling, and an immediate child of the target that each carry only a status claim. No assertion declares the behavior for `list`.

**Impact:** a context projection that read untracked scratch content, listed a spec path for a spec-less node directory in the manifest, or resolved a linked worktree to the main checkout's root would pass every linked test.

**Settlement condition:** a context node declares tracked-only selection, spec-less node handling, and worktree-local root resolution as `[test]` assertions, and linked evidence covers an untracked node-shaped directory, a spec-less node directory under both `list` and `show`, and a nested invocation inside a linked worktree.
