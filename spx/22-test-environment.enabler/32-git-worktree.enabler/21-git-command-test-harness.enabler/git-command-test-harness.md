---
id: 01a20686-3050-7ee7-8b7b-5de5ba4cdb01
---

# Git Command Test Harness

PROVIDES shared git subprocess constants, sanitized git environment builders, and async git command helpers for real-git test fixtures
SO THAT git-backed test environments and command-domain tests
CAN initialize repositories, run git commands, compare git arguments, and isolate subprocess git context without re-declaring git vocabulary or leaking ambient Git and GitHub Actions state

## Test.Scenario: git test environment

- [environment-cleaned](tests/git-command-test-harness.scenario.l1.test.ts):
  - Given an environment map carrying `GIT_DIR`, `GIT_WORK_TREE`, the GitHub Actions reporter trigger, and a caller-supplied non-Git override
  - When the git test environment is built from it
  - Then `GIT_DIR`, `GIT_WORK_TREE`, and the GitHub Actions reporter trigger are absent, `GIT_CONFIG_GLOBAL` is `/dev/null`, and the non-Git override keeps its value

## Test.Mapping: [git-vocabulary](tests/git-command-test-harness.mapping.l1.test.ts)

The git command constants and the argument comparison map to the values real-git tests pass to git and read from it.

| Case                    | Input                                              | Value                   |
| ----------------------- | -------------------------------------------------- | ----------------------- |
| command                 | `GIT_TEST_COMMAND`                                 | `git`                   |
| init-subcommand         | `GIT_TEST_SUBCOMMANDS.INIT`                        | `init`                  |
| inside-work-tree-flag   | `GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE`               | `--is-inside-work-tree` |
| head-ref                | `GIT_TEST_REF.HEAD_NAME`                           | `HEAD`                  |
| inside-work-tree-output | `GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE`         | `true`                  |
| node-executable         | `GIT_TEST_EXECUTABLE.NODE`                         | `node`                  |
| email-key               | `GIT_TEST_CONFIG.EMAIL_KEY`                        | `user.email`            |
| equal-args              | `gitArgsEqual` over two equal argument lists       | `true`                  |
| different-args          | `gitArgsEqual` over two argument lists that differ | `false`                 |

## Test.Compliance: git subprocess environment

- [explicit-environment](tests/git-command-test-harness.compliance.l1.test.ts): ALWAYS: `runGit` and `readGit` invoke git subprocesses with an explicitly built environment, so a `GIT_DIR` or `GIT_WORK_TREE` value in the environment they are given does not reach the subprocess
