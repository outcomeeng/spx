# Spec Tree Traversal

PROVIDES deterministic traversal and next-node selection over assembled spec-tree snapshots
SO THAT spec-domain commands and agent workflows
CAN select the next non-passing node without reimplementing tree walking

## Assertions

### Scenarios

- Given an assembled snapshot with passing and non-passing nodes, when next-node selection runs, then it returns the first non-passing node in tree order ([test](tests/spec-tree-traversal.scenario.l1.test.ts))
- Given an assembled snapshot whose nodes all pass, when next-node selection runs, then it returns no node ([test](tests/spec-tree-traversal.scenario.l1.test.ts))
