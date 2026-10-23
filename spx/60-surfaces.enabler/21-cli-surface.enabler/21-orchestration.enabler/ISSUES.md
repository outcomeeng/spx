# Known Issues

## The lock command runs tokens placed before the argument separator: `src/interfaces/cli/orchestration.ts` `hasArgumentSeparator` `spx/60-surfaces.enabler/21-cli-surface.enabler/21-orchestration.enabler/orchestration.md`

`hasArgumentSeparator` only tests whether a literal `--` appears in `rawArgs`, and the action runs the whole Commander `[command...]` array. So `spx orchestration lock ls -- foo` runs `ls foo`. An invocation without `--`, or with nothing after it, gets only an `invalid_arguments` JSON result line (exit 2) and no usage diagnostic naming the missing separator or command.

**Impact:** the guarded command vector is not the vector the separator delimits, so a token before `--` executes under the lock, and a malformed invocation gives the caller no usage guidance as specified by [spx/60-surfaces.enabler/21-cli-surface.enabler/21-orchestration.enabler/orchestration.md](spx/60-surfaces.enabler/21-cli-surface.enabler/21-orchestration.enabler/orchestration.md).

**Resolution:** derive the guarded vector strictly from the arguments after the first `--`, reject tokens before it, write a usage diagnostic for a missing separator or command, and add scenarios for the missing separator, the empty command, and a pre-separator token.

**Skills:** `/apply`, `/author-typescript-code`, `/author-typescript-test`, `/audit-typescript-code`, `/audit-typescript-test`.

**Revisit condition:** when the node's lock command code is next changed.

## An invalid wait duration yields a result line with an empty run id: `src/interfaces/cli/orchestration.ts` `createOrchestrationDomain lock action` `spx/60-surfaces.enabler/21-cli-surface.enabler/21-orchestration.enabler/orchestration.md`

On an invalid `--wait-seconds`, the action builds its report with `terminalOutcome(..., options.runId)`, whose default is the empty string. Without `--run-id`, the result line therefore carries `runId` `""`, while the library path generates an id for the same invocation shape. The report writer is duplicated in the action and bypasses the library's id generation.

**Impact:** the result line of an invalid-duration invocation lacks the run id that every other result line of [spx/60-surfaces.enabler/21-cli-surface.enabler/21-orchestration.enabler/orchestration.md](spx/60-surfaces.enabler/21-cli-surface.enabler/21-orchestration.enabler/orchestration.md) carries, so consumers correlating by run id cannot match it.

**Resolution:** generate the run id in the command, or route the rejection through the library, so every result line carries a non-empty id; add a scenario for an invalid `--wait-seconds` without `--run-id`.

**Skills:** `/apply`, `/author-typescript-code`, `/author-typescript-test`, `/audit-typescript-code`, `/audit-typescript-test`.

**Revisit condition:** when the node's lock command code is next changed.
