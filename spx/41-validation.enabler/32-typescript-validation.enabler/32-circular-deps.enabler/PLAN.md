# Dependency-cruiser hardening and evidence-cost plan

## Objective

Ship one final consolidated PR for dependency-cruiser circular validation after PR #205 merges. The PR must address the remaining dependency-cruiser hardening and circular-validation evidence cost in one review cycle, with the local `changes-reviewer` gate green before opening the remote PR.

## Observable path

An operator runs `spx validation circular` or `spx validation all` against a TypeScript project. The product reports dependency-cruiser circular dependency results correctly, keeps type-erased cycles from failing runtime validation, applies production scope consistently, and keeps the validation evidence suite from paying repeated packaged-subprocess fixture setup for semantics that can be verified below the process boundary.

## Slice

1. Finish PR #205 and merge it before starting the consolidated PR branch.
2. Create one branch from updated `origin/main` for all remaining circular-validation work.
3. Reduce permanent L2 subprocess cost:
   - Keep only the minimum packaged CLI smoke coverage needed to prove `node bin/spx.js validation circular` reaches the executable boundary.
   - Move circular scenario semantics to cheaper command-level or validation-step tests with injected dependencies or in-process fixtures.
   - Keep package-script coverage for published circular scope.
4. Harden dependency-cruiser behavior from the dependency-cruiser FAQ review:
   - Verify non-structured reporter output remains a clear validation failure.
   - Verify dependency-cruiser configuration keeps TypeScript source selection, TypeScript resolve extensions, package exclusion, tsconfig extraction, and pre-compilation dependency reporting aligned with the current circular-validation spec.
   - Verify runtime-cycle filtering covers the dependency-cruiser edge labels observed in the replacement work without relying on subprocess fixture repetition.
5. Resolve circular command `--files` parity:
   - Either make `spx validation circular --files <paths...>` constrain the dependency-cruiser input set consistently with other validation subcommands, or reject the unsupported flag instead of silently accepting it.
   - Cover the chosen behavior in the same command-level evidence set as the other circular CLI behavior.
6. Update specs, tests, implementation, and tracking notes in the same PR so no follow-up PR remains for dependency-cruiser/circular-validation cleanup.

## Local review protocol

1. Build the full intended changeset locally.
2. Commit the first complete version before local review so the work survives context compaction or interruption.
3. Run targeted deterministic checks while iterating; reserve the full suite for the final local gate and CI unless a reviewer finding specifically requires a narrower rerun first.
4. Run the first local `changes-reviewer` against the committed diff with no narrowing beyond repository/worktree and diff range.
5. Step back and reread the whole changeset against the specs, tests, implementation, and review findings.
6. Fix every valid in-scope issue with additional local commits.
7. Rerun deterministic checks after fixes.
8. Run local `changes-reviewer` again.
9. Open the PR only when the second local review is clean.

## Verification

- Targeted tests for circular command behavior, dependency-cruiser option construction, dependency-cruiser result parsing, runtime/type-erased cycle filtering, package-script wiring, and validation scope resolution.
- Scoped literal and TypeScript validation for touched TypeScript files during iteration.
- Final local deterministic gate before PR open, including the product's source validation, circular validation, build, and the tests affected by the consolidated PR.
- Local `changes-reviewer` green on the final committed diff before opening the PR.
- Remote CI and remote review green before merge.
