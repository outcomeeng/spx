---
id: 01a17aa8-1c00-7b3e-9c41-5d2f8a6e0b17
---

# Temp Directory

SUPPLIES one run root per run in the local worktree's `.spx/worktree/test-runs/`, product-local scratch directories under `node_modules/.cache/spx/`, and a worktree-local removal of the run roots an earlier run left
SO THAT every test, harness, generator, and spx command
CAN obtain and release temp directories without leaving entries behind, however a run ends

## Assertions

- Given a process with no inherited root, when it first requests a temp directory, then the primitive removes every directory in its worktree's `.spx/worktree/test-runs/`, creates one `run-<token>` root there, and creates the directory inside it ([test](tests/run-root.scenario.l1.test.ts))
- Given a root exported through `SPX_RUN_TEMP_ROOT` by a parent process, when a child process requests a temp directory, then the directory is created inside the inherited root, no new root is created, and no other directory in `.spx/worktree/test-runs/` is removed ([test](tests/run-root.scenario.l1.test.ts))
- Given a process that created a root, when it exits normally, then the root and everything inside it is removed ([test](tests/run-root.scenario.l2.test.ts))
- Given a directory inside a run root that holds no repository of its own, when git runs there under the environment the primitive exports, then git finds no repository ([test](tests/git-ceiling.scenario.l2.test.ts))
- Given a product directory, when a caller requests a product-local scratch directory, then the primitive creates it under `node_modules/.cache/spx/` with the `spx-run-` prefix and removes it at release ([test](tests/scratch.scenario.l1.test.ts))
- For any interleaving of directory requests and releases within one run, every directory lies inside the run root or the scratch parent and none remains after its release ([test](tests/run-root.property.l1.test.ts))
- ALWAYS: at a run's first scratch request for a parent inside its worktree, every leftover `spx-run-` entry in that parent is removed ([test](tests/sweep.compliance.l1.test.ts))
- NEVER: the primitive reads or removes a path outside its own worktree, or outside a run root or scratch parent it resolved ([test](tests/sweep.compliance.l1.test.ts))
- NEVER: a run root carries a liveness marker or takes a lock ([audit])
