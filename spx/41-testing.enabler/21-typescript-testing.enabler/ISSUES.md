# Issues: TypeScript Testing

These follow-ups concern how the (not-yet-built) `spx test` dispatch in `spx/41-testing.enabler/testing.md` must wire the vitest runner descriptor. The descriptor's own logic — detection gating, exclusion-flag generation, exit-code propagation — is complete and tested; these are contract requirements for the parent dispatch that invokes it.

## FOLLOW-UP: the dispatch must run the command runner in the product root

`runTests` passes `--root <projectRoot>` to vitest but delegates the command's working directory to the injected `runCommand`. `pnpm exec` resolves the package context and `node_modules` from its working directory, so the parent dispatch must bind the injected command runner's working directory to the resolved product root (mirroring how validation threads `ValidationStageContext.cwd`). Without that binding, running `spx test` from a subdirectory would resolve vitest from the wrong `node_modules`.

**Resolution:** when the `spx test` dispatch is built, bind the command runner's cwd to the resolved product root (and consider threading the product root through `TestRunnerDependencies` explicitly, as validation does through its stage context).

**Evidence:** Codex review (P2, `src/testing/languages/typescript.ts` invocation site) on PR #65.

## FOLLOW-UP: the dispatch must pass discovered spec-tree paths, not rely on empty-scope

`runTests` with `testPaths: []` invokes `vitest run --root <projectRoot>` with no positional filters, so vitest discovers every test the project's vitest config admits — not only `spx/**/tests`. In the intended flow the parent dispatch discovers `spx/**/tests` and passes those paths explicitly (non-empty), so the runner runs exactly the spec-tree tests. The empty-`testPaths` "full scope under root" behavior is used only by the runner's own L2 fixture harness.

**Resolution:** when the `spx test` dispatch is built, always pass the discovered spec-tree test paths so the run is scoped to spec-tree tests regardless of the consumer's vitest config; do not invoke the runner with empty `testPaths` against a real consumer project.

**Evidence:** Codex review (P2, `src/testing/languages/typescript.ts` empty-`testPaths` path) on PR #65.
