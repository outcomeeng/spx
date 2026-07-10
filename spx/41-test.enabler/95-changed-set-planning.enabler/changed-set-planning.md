# Changed-Set Planning

PROVIDES a `--changed [--base <ref>] [--staged]` operand source for `spx test` and `spx test passing` — resolving the tests affected by the branch's changes against a base ref (default `origin/<default-branch>`), optionally limiting the diff to the staged snapshot, partitioning changed paths into changed spec or test files that select discovered tests in the affected node subtree and changed source files that route through each registered language adapter's related-test capability, and feeding the resolved test-file set into the targeted-execution pipeline
SO THAT agents and developers running focused verification against their branch's diff
CAN run only the tests their changes affect — selected by diff rather than named operands — while obtaining the same runner selection, passing-scope policy, agent output, and recorded last-run evidence as a full run

## Assertions

### Scenarios

- Given a changed test or spec file under a node's `spx/<node>/`, when `--changed` resolves the affected set, then discovered tests in that node subtree are selected by path without reporting changed no-test nodes as unresolved explicit operands ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed source file whose registered language adapter declares a related-test capability, when `--changed` resolves the affected set, then that adapter's related tests are selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed source file whose registered language adapter declares no related-test capability, when `--changed` resolves the affected set, then no tests are selected from that file and the unresolved capability is reported ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed source file whose registered language adapter resolves related tests and another changed source file remains unresolved, when `--changed` resolves the affected set, then only the unresolved source file is reported as unresolved ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed testing harness source file imported through a tsconfig alias, when `--changed` resolves the affected set, then the importing test file is selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed TypeScript source file imported by a helper module that a candidate test imports, when `--changed` resolves the affected set, then the candidate test file is selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed TypeScript helper module is itself directly changed and imports another changed source file, when `--changed` resolves the affected set, then candidate tests importing that helper remain selected through the helper's downstream imports ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a candidate import directly matches a changed TypeScript source file while another candidate path reaches a changed source file through a helper import, when `--changed` resolves the affected set, then the direct match does not stop alternate candidate traversal and the importing test file is selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed TypeScript source index module imported through a tsconfig alias directory import, when `--changed` resolves the affected set, then the importing test file is selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed TypeScript source file under a tsconfig alias source root, when `--changed` resolves the affected set, then the importing test file is selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given changed testing harness source files and unrelated candidate tests that import other harnesses, when `--changed` resolves the affected set, then only the direct harness consumers are selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed path whose NUL-delimited name-status diff record contains path whitespace, when `--changed` reads changed paths, then the path is preserved exactly ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given `--changed` sees a rename in NUL-delimited name-status output, when changed paths are parsed, then both the original and new paths are included in the changed set with path whitespace preserved ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed path outside the spec tree and source roots, when `--changed` partitions changed paths, then it is ignored as an operand source ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed product config file and changed source files, when `--changed` resolves the affected set, then the full spec test tree is selected recursively without resolving source-related tests ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given `--changed` without `--base`, when the base ref resolves, then it resolves to `origin/<default-branch>`, and an explicit `--changed --base <ref>` uses `<ref>` ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given `--changed --staged`, when changed paths are read, then they come from the staged snapshot rather than the whole worktree diff ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given `--changed --staged` sees a staged rename in NUL-delimited name-status output, when changed paths are parsed, then both the original and new paths are included in the changed set with path whitespace preserved ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given `--changed --staged` resolves a changed source file through related tests, when candidate tests are listed and read, then candidate paths and content come from the staged snapshot ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a real repository on a branch ahead of its base, when `spx test passing --changed` runs against the real runner, then only the tests affected by the branch's changes execute and fresh last-run evidence is recorded ([test](tests/changed-set-planning.scenario.l2.test.ts))

### Properties

- The resolved set is the deduplicated union of the path-selected discovered tests and the adapter-derived related tests, unchanged by the order or repetition of changed paths ([test](tests/changed-set-planning.property.l1.test.ts))

### Compliance

- ALWAYS: the resolved set routes through `spx/41-test.enabler/90-targeted-execution.enabler` — the same runner adapters, runner environment, passing-scope policy, agent output, and last-run recording as a full run ([audit])
- ALWAYS: the planner reaches each language's related-test capability only through `src/test/registry.ts` per `spx/19-language-registration.adr.md`, naming no language in its own code paths ([audit])
