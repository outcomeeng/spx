# Multi-Target Composition

PROVIDES composition of one or more resolved context targets into a single deduplicated bundle — each shared document emitted once with every role and requiring target preserved, under canonical ordering and atomic validation
SO THAT agents and workflows loading context for several nodes at once
CAN receive one complete bundle instead of merging repeated single-target responses without provenance

## Assertions

### Scenarios

- Given two targets sharing product, ancestor, decision, and lower-index-sibling documents, when the bundle is built, then each shared document appears exactly once carrying every role it holds and every target that requires it ([test](tests/multi-target-composition.scenario.l1.test.ts))
- Given one target of a multi-target set fails resolution or a required document check, when the bundle is built, then the whole command fails and no partial bundle is emitted ([test](tests/multi-target-composition.scenario.l1.test.ts))

### Mappings

- Each requested target maps to its complete per-target read set through references into the deduplicated entry list, so per-target coverage is reconstructible from one bundle ([test](tests/multi-target-composition.mapping.l1.test.ts))

### Properties

- Target-order permutation stability: every ordering of the same target set produces byte-identical structured output ([test](tests/multi-target-composition.property.l1.test.ts))

### Compliance

- ALWAYS: the context command accepts one or more node-path operands, and a single-target invocation preserves the documented single-target contract ([test](tests/multi-target-composition.compliance.l1.test.ts))
