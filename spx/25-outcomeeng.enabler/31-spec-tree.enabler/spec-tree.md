PROVIDES Outcome Engineering graph semantics for artifacts represented by the Spec Tree methodology
SO THAT graph, source, test, spec, and change ownership workflows
CAN reason about product truth, verification evidence, source artifacts, and change records through one methodology model

## Assertions

### Compliance

- ALWAYS: Outcome Engineering Spec Tree graph semantics preserve product-truth, verification-evidence, source-artifact, and change-record relationships as distinct artifact categories ([test](tests/spec-tree.compliance.l1.test.ts))
- ALWAYS: graph semantics describe product-truth, evidence, implementation-artifact, and change-record relationships before CLI, repository-local, hosted, or agent-specific surfaces expose them ([test](tests/spec-tree.compliance.l1.test.ts))
