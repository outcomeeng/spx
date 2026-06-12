# Issues: Testing Config

## FOLLOW-UP: reconcile `spx/EXCLUDE` wording with testing passing scope

`spx/EXCLUDE` still says `spx test passing` skips the listed nodes, but `spx test passing` reads its passing-scope exclusions from the `testing.passingScope` config descriptor. Current `spx/EXCLUDE` consumers are markdown validation and node-status classification through `createIgnoreSourceReader`; testing does not read it as passing-scope policy.

**Resolution:** update `spx/EXCLUDE` to describe its actual consumers: markdown-validation exclusion and node-status `specified` classification. Then assess whether the listed nodes also need `spx.config.yaml` `testing.passingScope.exclude` entries or whether no testing exclusion is needed because they have no test files.

**Evidence:** `spx/EXCLUDE`; `spx.config.yaml`; `src/commands/testing/run-command.ts` `runTestsCommand`; `src/testing/config.ts`; `src/validation/steps/markdown.ts`; `spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`; `spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md`.
