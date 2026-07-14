# Known issues

## Init command constructs its subprocess dependency

`src/commands/claude/init.ts:6` imports `execa` directly, and the command constructs the subprocess dependency inside the command layer. The governing [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md) requires command handlers to receive host and backend capabilities through injected ports. No assertion or test currently governs this init boundary.

## Required work

1. Identify the child node that owns `spx claude init`.
2. Align its spec with the subprocess boundary.
3. Add evidence through the [Spec Tree test workflow](../../AGENTS.md#spec-management).
4. Inject the typed production capability.
5. Run the TypeScript test and implementation audits required by that workflow.

## Revisit condition

Resolve this issue before modifying `src/commands/claude/init.ts` or extending `spx claude init` behavior.
