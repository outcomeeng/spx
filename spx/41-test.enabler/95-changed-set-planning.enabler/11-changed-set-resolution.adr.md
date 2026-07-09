# Changed-Set Resolution

The `--changed` planner resolves its affected test set by diffing the worktree against a base ref that defaults to `origin/<default-branch>` resolved through the shared `src/lib/git/root.ts` primitives, with `--staged` switching that diff to the staged snapshot, partitioning each changed path into one of two routes — a changed spec or test file under `spx/<node>/` becomes an affected-node selection input by path alone and is resolved to discovered test-file paths in that node subtree, and a changed source file is resolved to its related test file paths by the registered language adapter's related-test capability reached only through `src/test/registry.ts` — and feeds the deduplicated test-file union into the `spx/41-test.enabler/90-targeted-execution.enabler` selection so `--changed` is one more operand source, never a parallel dispatch. A registered language whose adapter declares no related-test capability contributes nothing from its changed source files, and that degradation is reported rather than silently dropped.

## Rationale

A changed spec or test file has a direct path relation to the tests it affects, so pure path math turns it into an affected-node selection input and planner orchestration resolves that input against discovered tests before dispatch. Resolving at this layer keeps renamed paths and changed nodes with no direct tests from becoming unresolved caller operands, while still selecting surviving tests under the affected subtree. A changed source file has no path relation to the tests that exercise it, so its related tests come from a registered language resolver (TypeScript parses candidate test files and maps relative imports plus tsconfig aliases such as `@/` and `@testing/` to changed source paths, including index modules) reached through the registry so the planner names no language per `spx/19-language-registration.adr.md`. Because the related-test capability resolves to test file *paths* rather than running tests, its output is operands the `spx/41-test.enabler/90-targeted-execution.enabler` selection already consumes, so runner selection, runner environment, passing-scope policy, agent output, and last-run recording stay identical to a full run and to an explicit-operand run, with no parallel dispatch path to drift. Defaulting the base to `origin/<default-branch>` through the shared default-branch and ref-resolution primitives gives changed-set planning the same `origin/HEAD` semantics as product-root git resolution while keeping one base-resolution contract. In staged mode, the planner parses name-status diff output so staged renames retain both paths, lists candidate test paths from the index, and gives related-test resolvers indexed test content.

The layering follows `spx/14-cli-composition.adr.md`: the changed-path partition is a pure function under `src/domains/test/` that takes the changed path set and returns operands plus the source files to route; the planner orchestration under `src/commands/test/` composes the injected git runner, the base-ref primitives, the staged-diff flag, and the registry's related-test resolvers and returns its result; the `src/interfaces/cli/` descriptor owns the `--changed`/`--base`/`--staged` option surface and the process boundary.

A static "expensive node" list or precommit-ownership rule is rejected: selection is uniform across every node, with no special-casing. Silently dropping a changed source file for a language whose adapter declares no related-test capability is rejected: it hides a coverage gap, so the degradation is reported instead. A related-test capability that runs tests directly rather than resolving file paths is rejected: it forks dispatch away from the operand pipeline. A planner that branches on language is rejected: it reverses the registry boundary `spx/19-language-registration.adr.md` establishes.

## Invariants

- The resolved operand set is the deduplicated union of the path-derived discovered test paths and the adapter-resolved related-test paths; the order and repetition of changed paths do not change it.
- A changed path under a node's `spx/<node>/tests/` or matching a node's spec yields an affected-node selection input by path alone, with no language tool invoked.
- The planner reaches every language's related-test capability only through the testing registry; no language name appears in the planner.

## Verification

### Testing

- ALWAYS: when `--base` is omitted, the planner resolves the base ref to `origin/<default-branch>` through the shared `src/lib/git/root.ts` primitives, and an explicit `--base <ref>` overrides it ([compliance])
- ALWAYS: when `--staged` is present, the planner reads changed paths, candidate test paths, and candidate test content from the staged snapshot with the same base-ref resolution path ([compliance])
- ALWAYS: a changed spec or test file under `spx/<node>/` yields an affected-node selection input by path alone and resolves to discovered test-file paths without reporting no-test node paths as unresolved explicit operands ([mapping])
- ALWAYS: a changed source file whose registered language adapter declares a related-test capability resolves to that adapter's related test file paths through `src/test/registry.ts` ([mapping])
- ALWAYS: the resolved operand set is the deduplicated union of path-derived and adapter-resolved operands, independent of changed-path order and repetition ([property])
- NEVER: a changed source file is silently dropped when its registered language adapter declares no related-test capability — the planner reports the degradation ([compliance])

### Audit

- ALWAYS: the changed-path partition is a pure function under `src/domains/test/` taking the changed path set and returning operands plus the source files to route, with no git, filesystem, or process access — so it verifies in isolation ([audit])
- ALWAYS: the planner orchestration lives under `src/commands/test/`, accepts an injected git runner and the testing registry, and returns its result for the descriptor to surface — so it verifies against temporary fixtures without the process boundary ([audit])
- ALWAYS: the related-test capability resolves source files to test file paths through injected file reads over candidate test files, and base-ref resolution reuses `resolveDefaultBranch` and `resolveRefSha` over the injected git runner — never a second default-branch implementation ([audit])
- ALWAYS: the resolved test-file set feeds the `spx/41-test.enabler/90-targeted-execution.enabler` selection unchanged, so `--changed` alters only the selected set while runner adapters, runner environment, passing-scope policy, agent output, and last-run recording stay identical to a full run ([audit])
- NEVER: substitute the git runner, command runner, or filesystem boundary through framework-level module replacement or in-memory filesystem replacement — tests inject controlled implementations and exercise the real code paths ([audit])
- NEVER: a static expensive-node list, precommit-ownership rule, or any per-node special-casing governs which changed nodes are selected — selection is uniform across every node ([audit])
