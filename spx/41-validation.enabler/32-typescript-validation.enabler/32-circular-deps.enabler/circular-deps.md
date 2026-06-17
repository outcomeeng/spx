# TypeScript Circular Dependencies

PROVIDES dependency-cruiser-based circular dependency detection for TypeScript source code
SO THAT `spx validation circular` and `spx validation all`
CAN walk the TypeScript import graph and surface cycles that would otherwise cause runtime initialization failures, while leaving non-TypeScript projects untouched

## Assertions

### Scenarios

- Given a TypeScript project with no circular dependencies, when `spx validation circular` runs, then dependency-cruiser reports no cycles and the command exits zero ([test](tests/circular-deps.scenario.l2.test.ts))
- Given a TypeScript project with a circular dependency, when `spx validation circular` runs, then the command exits non-zero and reports the cycle ([test](tests/circular-deps.scenario.l2.test.ts))
- Given a TypeScript project with a cycle composed only of erased type-only imports, when `spx validation circular` runs, then the command exits zero and reports no circular dependencies ([test](tests/circular-deps.scenario.l2.test.ts))
- Given dependency-cruiser reports a circular result whose initial dependency survives runtime but whose cycle path contains a type-import or pre-compilation-only vertex, including a pre-compilation-only vertex that also carries an import label, when circular dependency validation evaluates the result, then validation succeeds with no circular dependency cycles ([test](tests/circular-deps.scenario.l1.test.ts))
- Given dependency-cruiser reports a circular result with mixed value and type-only or type-import labels on a runtime dependency, when circular dependency validation evaluates the result, then validation reports the circular dependency cycle ([test](tests/circular-deps.scenario.l1.test.ts))
- Given dependency-cruiser reports a circular result without a cycle payload and the initial dependency survives runtime, when circular dependency validation evaluates the result, then validation reports a two-node circular dependency cycle using the dependency's resolved target ([test](tests/circular-deps.scenario.l1.test.ts))
- Given dependency-cruiser reports a circular result without a cycle payload and the initial dependency is type-erased, when circular dependency validation evaluates the result, then validation succeeds with no circular dependency cycles ([test](tests/circular-deps.scenario.l1.test.ts))
- Given dependency-cruiser reports a circular result whose initial dependency is pre-compilation-only, when circular dependency validation evaluates the result, then validation succeeds with no circular dependency cycles ([test](tests/circular-deps.scenario.l1.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx validation circular` runs, then the command emits the TypeScript-absent skip result and dependency-cruiser does not run ([test](tests/circular-deps.scenario.l2.test.ts))
- Given a project with TypeScript files and no `tsconfig.json`, when `spx validation circular` runs, then the command emits the TypeScript-absent skip result and dependency-cruiser does not run ([test](tests/circular-deps.scenario.l2.test.ts))
