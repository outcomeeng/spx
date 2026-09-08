# Tree Parser

PROVIDES an in-memory tree representation parsed from the `spx/` directory structure
SO THAT status, verify, and context injection commands
CAN traverse the spec tree without re-reading the filesystem on every operation

## Assertions

### Scenarios

- Given a directory with `.enabler` suffix, when parsed, then the node type is enabler ([test](tests/tree-parser.scenario.l1.test.{ext}))
- Given a directory with `.outcome` suffix, when parsed, then the node type is outcome ([test](tests/tree-parser.scenario.l1.test.{ext}))
- Given a nested directory structure 3 levels deep, when parsed, then the tree preserves parent-child relationships ([test](tests/tree-parser.scenario.l1.test.{ext}))

### Mappings

- Directory suffix maps to node type: `.enabler` → enabler, `.outcome` → outcome ([test](tests/tree-parser.mapping.l1.test.{ext}))

### Properties

- Parsing is deterministic: the same directory structure always produces the same tree ([test](tests/tree-parser.property.l1.test.{ext}))
- Round-trip consistency: serializing a parsed tree and re-parsing produces an identical tree ([test](tests/tree-parser.property.l1.test.{ext}))

### Compliance

- ALWAYS: ignore dotfiles and `node_modules` during traversal — prevents accidental inclusion of tooling artifacts
- NEVER: follow symlinks outside the `spx/` root — prevents path traversal
