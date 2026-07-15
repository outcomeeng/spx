# TypeScript Source Graph

PROVIDES TypeScript implementation-source facts — executed test coverage and module-graph reachability adapted from established TypeScript tooling output — through the source graph provider descriptor contract
SO THAT the source ownership kernel, garbage-collection candidate derivation, and changed-test planning
CAN classify TypeScript source artifacts against linked-test evidence without SPX parsing TypeScript source text

## Assertions

### Mappings

- Every test-attributed coverage entry in supplied Vitest coverage output maps to one raw provider fact carrying the coverage fact kind, the executing test path, the covered source path, the `typescript` language, and the coverage tool's provider identity ([test](tests/typescript-source-graph.mapping.l1.test.ts))
- Every source module reachable from a test entry through supplied TypeScript module-graph edges maps to one raw provider fact carrying the reachability fact kind, that test entry path, the reachable source path, the `typescript` language, and the module-graph tool's provider identity ([test](tests/typescript-source-graph.mapping.l1.test.ts))

### Compliance

- ALWAYS: the source graph provider registry reaches the TypeScript provider descriptor through an explicit import statement ([test](tests/typescript-source-graph.compliance.l1.test.ts))
- ALWAYS: every emitted fact carries a registered provider fact kind and provenance naming the `typescript` language and the emitting tool ([test](tests/typescript-source-graph.compliance.l1.test.ts))
- ALWAYS: facts derive deterministically and only from data present in the tool output supplied through the provider's typed input boundary ([test](tests/typescript-source-graph.compliance.l1.test.ts))
- NEVER: the provider reads the filesystem, invokes a process, or parses TypeScript source text ([audit])
