# Issues: spx verification `<type> run` command surface

> Coordination note, not product truth. Reconcile against `execute-run.md`, the executor spec
> `spx/34-verification.enabler/43-execute.enabler/execute.md`, and the TypeScript descriptor
> `spx/41-test.enabler/21-typescript-test.enabler/typescript-test.md` before acting.

## Streaming default run-starter loads the dev-only Vitest Node API at runtime

The executor drives a verification type's runner resolved through that type's registry
(`resolveVerificationRunner` / `resolveTestRunner` in `src/commands/verification-exec/`), which for
`test` reaches the TypeScript descriptor's journal-streaming run. That run defaults to the production
Vitest run-starter (`createVitestRunStarter` in `src/test/languages/journal-reporter.ts`), which loads
`vitest/node` through a dynamic import. `tsup.config.ts` externalizes `vitest`/`vitest/node` (never
bundled; resolved at runtime). Vitest is a `devDependency`, so a globally installed `spx` has no
`vitest/node` in its own resolution scope, and ESM resolves the bare specifier relative to the
shipped module, not the invocation cwd.

The executor node (`spx/34-verification.enabler/43-execute.enabler`) injects controlled runners in its
`l1` tests, so it never exercises the real default starter. This surface node is where a
`spx verification test run` command drives the real runner in a shipped context. When this node's
`/apply` wires that command, it must make `vitest/node` resolvable at runtime — declare Vitest a
runtime dependency, resolve it from the target product's `node_modules`, or run the streaming run in
the target's own context — rather than relying on the dev-time devDependency.

Surfaced by the descriptor streaming-run PR's packaged build; migrated here from the executor node
once the executor's `/apply` composed the runner without the shipped command path.
