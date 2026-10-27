# Issues: Git Utility

## DEBT — Product-launched git discards the exported git ceiling `src/lib/git/environment.ts` `withoutGitEnvironment` [`spx/13-temp-directory.substrate/21-run-scoped-temp-root.adr.md`](spx/13-temp-directory.substrate/21-run-scoped-temp-root.adr.md)

`withoutGitEnvironment` in `src/lib/git/environment.ts` deletes every `GIT_*` variable from the environment of product-launched git, `GIT_CEILING_DIRECTORIES` included.

Evidence: [`spx/13-temp-directory.substrate/21-run-scoped-temp-root.adr.md`](spx/13-temp-directory.substrate/21-run-scoped-temp-root.adr.md) has the invocation export `GIT_CEILING_DIRECTORIES` so that git run in a directory inside the run root never discovers the enclosing repository. Product-launched git never sees the exported ceiling. The diagnose bare scenario (`testing/harnesses/diagnose/cli-scenarios.ts`, via `repositoryFreeWorkingDirectory` in `testing/harnesses/diagnose/cli.ts`) works around it by taking a working directory outside any repository; running the CLI by hand with the ceiling set still finds the enclosing worktree pool.

Impact: any scenario that relies on the ceiling to hide the repository from the product's own git calls finds the repository.

Settlement condition: the product's read-only git environment either keeps the ceiling variable by a spec and evidence in this node, or the run-root decision stops relying on the ceiling for product-launched git.
