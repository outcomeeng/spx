# Tree Building

PROVIDES the tree construction and validation functions — buildTree assembles a flat work-item list into a hierarchical WorkItemTree with rolled-up statuses, and validateTree checks the resulting structure for invariant violations
SO THAT every spx domain that needs to display or process hierarchical work items
CAN obtain a correctly linked, BSP-sorted, and validated WorkItemTree through a single construction call

## Assertions

### Scenarios

- Given a capability work item and a feature work item whose path is nested under the capability path, when building a tree, then the feature appears in the capability's children array ([test](tests/tree-building.scenario.l1.test.ts))
- Given a feature work item and a story work item whose path is nested under the feature path, when building a tree, then the story appears in the feature's children array ([test](tests/tree-building.scenario.l1.test.ts))
- Given a capability with two features having BSP numbers 32 and 21 respectively, when building a tree, then the feature with BSP 21 appears before the feature with BSP 32 in the children array ([test](tests/tree-building.scenario.l1.test.ts))
- Given a feature with three stories having BSP numbers 43, 21, and 32, when building a tree, then stories appear in ascending BSP order ([test](tests/tree-building.scenario.l1.test.ts))
- Given a story work item whose path has no matching feature ancestor, when building a tree, then buildTree rejects with an error whose message matches /orphan|parent/i ([test](tests/tree-building.scenario.l1.test.ts))
- Given multiple capabilities in the work item list, when building a tree, then all capabilities appear at the tree root ([test](tests/tree-building.scenario.l1.test.ts))
- Given a tree where all stories and features have status DONE, when building a tree, then the capability status is DONE ([test](tests/tree-building.scenario.l1.test.ts))
- Given a tree where a capability has own status OPEN and all children have status DONE, when building a tree, then the capability status is IN_PROGRESS ([test](tests/tree-building.scenario.l1.test.ts))
- Given a tree where a capability has own status DONE and one child has status IN_PROGRESS, when building a tree, then the capability status is IN_PROGRESS ([test](tests/tree-building.scenario.l1.test.ts))
- Given a tree where capabilities and children have mixed DONE and OPEN statuses, when building a tree, then any item with at least one non-DONE descendant has status IN_PROGRESS ([test](tests/tree-building.scenario.l1.test.ts))
- Given a tree where all items have status OPEN, when building a tree, then every node status is OPEN ([test](tests/tree-building.scenario.l1.test.ts))
- Given a valid tree with simple structure, when validating, then validateTree does not throw ([test](tests/tree-building.scenario.l1.test.ts))
- Given a tree where two siblings at the same parent share the same BSP number, when validating, then TreeValidationError is thrown with message matching /duplicate/i ([test](tests/tree-building.scenario.l1.test.ts))
- Given a story node that is a direct child of a capability (no feature in between), when validating, then TreeValidationError is thrown ([test](tests/tree-building.scenario.l1.test.ts))
- Given a story node that itself has children, when validating, then TreeValidationError is thrown with message matching /leaf/i ([test](tests/tree-building.scenario.l1.test.ts))
- Given a path collision producing a cycle in the node graph, when validating, then TreeValidationError is thrown with message matching /cycle/i ([test](tests/tree-building.scenario.l1.test.ts))
