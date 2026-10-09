# Open Issues

## `git-test-constants.ts` redeclares git tokens that production code declares

[`spx/12-test-infrastructure.adr.md`](spx/12-test-infrastructure.adr.md) gives a production-owned token exactly one owner, in production code, which test infrastructure imports directly, and forbids test infrastructure to redeclare command vocabulary. `testing/harnesses/git-test-constants.ts` declares these tokens as its own literals, and production code passes each of them to a git invocation or reads it from git's output:

| Declaration in `testing/harnesses/git-test-constants.ts` | Token                  | Production owner                                                                                                |
| -------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GIT_TEST_COMMAND`                                       | `git`                  | `GIT_ROOT_COMMAND.EXECUTABLE` in `src/lib/git/root.ts`                                                          |
| `GIT_TEST_SUBCOMMANDS.CHECKOUT`                          | `checkout`             | `GIT_CHECKOUT_COMMAND` in `src/lib/methodology/fetch.ts`, not exported                                          |
| `GIT_TEST_SUBCOMMANDS.CLONE`                             | `clone`                | `GIT_CLONE.COMMAND` in `src/lib/methodology/fetch.ts`, not exported                                             |
| `GIT_TEST_SUBCOMMANDS.CONFIG`                            | `config`               | `GIT_ROOT_COMMAND.CONFIG` in `src/lib/git/root.ts`                                                              |
| `GIT_TEST_SUBCOMMANDS.LS_FILES`                          | `ls-files`             | `GIT_LS_FILES_COMMAND` in `src/lib/git/changed-paths.ts`                                                        |
| `GIT_TEST_SUBCOMMANDS.REV_PARSE`                         | `rev-parse`            | `GIT_ROOT_COMMAND.REV_PARSE` in `src/lib/git/root.ts`                                                           |
| `GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF`                      | `symbolic-ref`         | `GIT_ROOT_COMMAND.SYMBOLIC_REF` in `src/lib/git/root.ts`                                                        |
| `GIT_TEST_SUBCOMMANDS.TAG`                               | `tag`                  | `GIT_RELEASE_SUBCOMMAND.TAG` in `src/lib/git/release.ts`                                                        |
| `GIT_TEST_SUBCOMMANDS.WORKTREE`                          | `worktree`             | `GIT_ROOT_COMMAND.WORKTREE` in `src/lib/git/root.ts`                                                            |
| `GIT_TEST_FLAGS.CACHED`                                  | `--cached`             | `GIT_LS_FILES_ARGS.CACHED` in `src/lib/file-inclusion/ignore-source.ts`, the `ls-files` form the harness passes |
| `GIT_TEST_FLAGS.EXCLUDE_STANDARD`                        | `--exclude-standard`   | `GIT_LS_FILES_EXCLUDE_STANDARD_FLAG` in `src/lib/git/changed-paths.ts`                                          |
| `GIT_TEST_FLAGS.FULL_NAME`                               | `--full-name`          | `GIT_LS_FILES_ARGS.FULL_NAME` in `src/lib/file-inclusion/ignore-source.ts`                                      |
| `GIT_TEST_FLAGS.OTHERS`                                  | `--others`             | `GIT_LS_FILES_OTHERS_FLAG` in `src/lib/git/changed-paths.ts`                                                    |
| `GIT_TEST_FLAGS.QUIET`                                   | `--quiet`              | `GIT_ROOT_COMMAND.QUIET` in `src/lib/git/root.ts`                                                               |
| `GIT_TEST_REF.HEAD_NAME`                                 | `HEAD`                 | `GIT_ROOT_COMMAND.HEAD` in `src/lib/git/root.ts`                                                                |
| `GIT_TEST_REF.REMOTE_ORIGIN_PREFIX`                      | `refs/remotes/origin/` | `REMOTE_ORIGIN_REF_PREFIX` in `src/lib/git/root.ts`                                                             |

`src/lib/file-inclusion/ignore-source.ts` also declares `ls-files`, `--others`, and `--exclude-standard` in `GIT_LS_FILES_ARGS`, and `src/lib/git/changed-paths.ts` declares `--cached` as `GIT_DIFF_CACHED_FLAG` for its `diff` invocation, so production holds two declarations of those `ls-files` tokens.

The file's other git declarations carry tokens no production code passes to git: the `init`, `add`, `commit`, `branch`, `fetch`, `merge`, `submodule`, and `update-ref` subcommands; the `-c`, `-m`, `-b`, `--bare`, `--detach`, `--all`, `--allow-empty`, `--is-inside-work-tree`, `--move`, `--no-commit`, `--no-ff`, `--remove-section`, and `--show-current` flags; the fixture identity and `origin` remote config keys; the Git environment variable names; and the `rev-parse --is-inside-work-tree` output. They are harness execution configuration, which [`spx/12-test-infrastructure.adr.md`](spx/12-test-infrastructure.adr.md) assigns to harnesses. `AGENT_TRANSCRIPT_GIT_COMMAND` in `src/domains/agent/protocol.ts` spells several of the same tokens, but it recognizes git commands inside agent transcripts and invokes no git, so it owns none of them for a harness that runs git.

**Impact:** a production change to any listed token leaves the harness constant at its old value, so real-git fixtures exercise a command production no longer runs and the evidence built on them still passes. Every harness path and test that imports a listed constant carries the copy.

**Settlement condition:** `testing/harnesses/git-test-constants.ts` declares none of the listed tokens; every harness path and test that passes one of them to git imports it from a production declaration, with each owner that keeps its declaration module-private exporting it; and the file keeps only tokens no production code passes to git.
