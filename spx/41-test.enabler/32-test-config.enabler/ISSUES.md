# Issues: Test Config

## FOLLOW-UP: reconcile `spx/EXCLUDE` wording with testing passing scope

`spx/EXCLUDE` still says `spx test passing` skips the listed nodes, but `spx test passing` reads its passing-scope exclusions from the `testing.passingScope` config descriptor. Current `spx/EXCLUDE` consumers are markdown validation and node-status classification through `createIgnoreSourceReader`; testing does not read it as passing-scope policy.

**Resolution:** update `spx/EXCLUDE` to describe its actual consumers: markdown-validation exclusion and node-status `specified` classification. Reconcile each listed node before removing it from `spx/EXCLUDE`; `spx/17-file-inclusion.enabler/32-path-predicates.enabler/ISSUES.md` records the path-predicates spec/test mismatch that prevents removing that entry. Assess whether the remaining listed nodes also need `spx.config.yaml` `testing.passingScope.exclude` entries or whether no testing exclusion is needed because they have no test files.

**Evidence:** `spx/EXCLUDE`; `spx.config.yaml`; `src/commands/test/run-command.ts` `runTestsCommand`; `src/test/config.ts`; `src/validation/steps/markdown.ts`; `spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`; `spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md`.
