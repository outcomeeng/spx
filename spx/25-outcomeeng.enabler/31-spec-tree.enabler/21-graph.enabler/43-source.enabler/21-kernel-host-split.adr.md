# Kernel-Host Split

The source graph implementation lives under `src/outcomeeng/spec-tree/graph/source/` as Outcome Engineering graph core — not a command domain — with four modules in one dependency direction: `kernel/` owns the pure ownership model (classification vocabulary, evidence categories, and classification derivation over injected facts), `providers/` owns the typed provider descriptor contract and the explicit-import descriptor registry, `normalize/` owns product-root-relative artifact identity and provenance normalization, and `gc/` owns garbage-collection candidate derivation over kernel classifications. Every module under the path is pure: a deterministic function of its parameters, with no Commander, process, filesystem, git, or language-AST access. A provider descriptor collects facts as a pure transformation of provider-typed established-tool output supplied as a parameter; tool invocation, artifact discovery, and file reading are host concerns outside the source-graph path.

## Rationale

The source graph is a methodology capability consumed by ownership, garbage-collection, and changed-test-planning workflows, so it does not take the `src/domains/{domain}/` command layout of [`spx/14-cli-composition.adr.md`](../../../../14-cli-composition.adr.md); a command domain that later exposes the graph wires it as an injected capability from its own descriptor. A dedicated `src/outcomeeng/` root keeps the graph-kernel contract movable to a future non-TypeScript kernel while TypeScript remains the CLI and package host — the kernel's purity is what makes that move a re-binding rather than a rewrite. The descriptor registry mirrors [`spx/19-language-registration.adr.md`](../../../../19-language-registration.adr.md): a language provider joins by one typed descriptor module and one explicit registry import, so the provider set is enumerable at compile time and orchestration never names a language. Facts enter as data through injected provider outputs per [`spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/11-source-provider-boundary.adr.md`](11-source-provider-boundary.adr.md) and tree facts arrive through the library boundary of [`spx/25-outcomeeng.enabler/31-spec-tree.enabler/11-graph-library-boundary.adr.md`](../../11-graph-library-boundary.adr.md), so no module under the path needs I/O. A shared-utility placement under `src/lib/` is rejected because the graph is a governed product capability with its own decision records, not a neutral helper; placement inside `src/domains/` is rejected because it would bind the kernel to the CLI composition layers and invert the host/kernel direction.

## Invariants

- Every kernel, normalization, and gc output is a deterministic function of the injected fact inputs.
- Every provider descriptor's fact collection is a deterministic function of its provider-typed tool-output parameter.
- Every classification value, evidence-category value, language identifier, and provider identifier has exactly one owning `as const` declaration under `src/outcomeeng/spec-tree/graph/source/`.
- The descriptor registry enumerates exactly the provider descriptors reached through explicit import statements.
- Every fact the kernel classifies carries normalized product-root-relative artifact identity plus language and provider provenance.

## Verification

### Audit

- ALWAYS: source graph modules live under `src/outcomeeng/spec-tree/graph/source/` in the `kernel/`, `providers/`, `normalize/`, `gc/` split, and no module under that path imports Commander, `src/commands/`, `src/interfaces/`, process APIs, `node:fs`, `node:child_process`, or git plumbing ([audit])
- ALWAYS: kernel, normalization, and gc modules are structured so every fact enters as a typed parameter — no import of a filesystem, process, or tool-invocation API appears under the path; the runtime rejection of unattributable facts is the tested rule of [`spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/11-source-provider-boundary.adr.md`](11-source-provider-boundary.adr.md), which also owns the no-implementation-parsing boundary ([audit])
- ALWAYS: provider participation is declared through a typed descriptor exported from one module per provider, and the registry reaches every descriptor through an explicit import statement ([audit])
- ALWAYS: a provider descriptor receives established-tool output as a typed parameter and emits raw provider facts from that data alone — tool invocation, artifact discovery, and file reading happen host-side, outside `src/outcomeeng/spec-tree/graph/source/` ([audit])
- ALWAYS: classification vocabulary, evidence categories, language identifiers, and provider identifiers are source-owned declarations that tests and generators import from the owning module ([audit])
- ALWAYS: reusable variable test inputs for the source graph are produced by a pure, side-effect-free generator under `testing/generators/outcomeeng/`, governed by this node per [`spx/12-test-infrastructure.adr.md`](../../../../12-test-infrastructure.adr.md) ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or module interception in any source-graph test — controlled facts enter through the public parameter surface ([audit])
