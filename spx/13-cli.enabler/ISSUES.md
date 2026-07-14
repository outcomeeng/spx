# Known issues

## Failure exits bypass the source-owned registry

The command-line interface boundary owns `CLI_EXIT_CODE` in `src/interfaces/cli/invocation.ts:15`, while these descriptors pass the literal failure code `1` to `io.exit`:

- `src/interfaces/cli/release.ts:47`
- `src/interfaces/cli/diagnose.ts:65`
- `src/interfaces/cli/session.ts:108,207,289,358,406,431`
- `src/interfaces/cli/worktree.ts:48`
- `src/interfaces/cli/hook.ts:148,159`
- `src/interfaces/cli/spec.ts:68`

The literal uses bypass the source-owned closed vocabulary required by the [TypeScript standards](../local/typescript.md) and make failure-code changes depend on text search instead of registry references.

## Required work

1. Contextualize each owning command domain.
2. Align any affected assertions.
3. Replace the literal exits with the source-owned registry.
4. Add or update evidence through the [Spec Tree test workflow](../../AGENTS.md#spec-management).
5. Run the TypeScript test and implementation audits required by that workflow.

## Revisit condition

Resolve this issue before changing `CLI_EXIT_CODE` or editing failure-exit behavior in any listed descriptor.
