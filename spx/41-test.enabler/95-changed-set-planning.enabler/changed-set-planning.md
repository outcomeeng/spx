# Changed-Set Planning

PROVIDES a `--changed [--base <ref>]` operand source for `spx test` and `spx test passing` — resolving the tests affected by the branch's changes against a base ref (default `origin/<default-branch>`), partitioning changed paths into changed spec or test files that select their own node's `tests/` directly and changed source files that route through each registered language adapter's related-test capability, and feeding the resolved set into the targeted-execution pipeline
SO THAT agents and developers running focused verification against their branch's diff
CAN run only the tests their changes affect — selected by diff rather than named operands — while obtaining the same runner selection, passing-scope policy, agent output, and recorded last-run evidence as a full run

## Assertions

### Scenarios

- Given a changed test or spec file under a node's `spx/<node>/`, when `--changed` resolves the affected set, then that node's `tests/` files are selected by path ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed source file whose registered language adapter declares a related-test capability, when `--changed` resolves the affected set, then that adapter's related tests are selected ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a changed source file whose registered language adapter declares no related-test capability, when `--changed` resolves the affected set, then no tests are selected from that file and the unresolved capability is reported ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given `--changed` without `--base`, when the base ref resolves, then it resolves to `origin/<default-branch>`, and an explicit `--changed --base <ref>` uses `<ref>` ([test](tests/changed-set-planning.scenario.l1.test.ts))
- Given a real repository on a branch ahead of its base, when `spx test passing --changed` runs against the real runner, then only the tests affected by the branch's changes execute and fresh last-run evidence is recorded ([test](tests/changed-set-planning.scenario.l2.test.ts))

### Properties

- The resolved set is the deduplicated union of the path-selected node tests and the adapter-derived related tests, unchanged by the order or repetition of changed paths ([test](tests/changed-set-planning.property.l1.test.ts))

### Compliance

- ALWAYS: the resolved set routes through `spx/41-test.enabler/90-targeted-execution.enabler` — the same runner adapters, runner environment, passing-scope policy, agent output, and last-run recording as a full run ([audit])
- ALWAYS: the planner reaches each language's related-test capability only through `src/test/registry.ts` per `spx/19-language-registration.adr.md`, naming no language in its own code paths ([audit])
