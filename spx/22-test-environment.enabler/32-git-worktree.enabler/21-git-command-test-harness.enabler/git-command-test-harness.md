# Git Command Test Harness

PROVIDES shared git subprocess constants, sanitized git environment builders, and async git command helpers for real-git test fixtures
SO THAT git-backed test environments and command-domain tests
CAN initialize repositories, run git commands, compare git arguments, and isolate subprocess git context without re-declaring git vocabulary or leaking ambient Git and GitHub Actions state

## Assertions

### Scenarios

- Given a polluted environment map with Git and GitHub Actions variables, when the git test environment is built, then Git context variables are stripped, global git config is neutralized, GitHub Actions reporter activation is removed, and caller-supplied non-Git overrides are preserved ([test](tests/git-command-test-harness.scenario.l1.test.ts))

### Mappings

- Git command constants map to the git executable, supported git subcommands, supported git flags, reference names, output sentinels, executable names, and repository identity keys used by real-git tests ([test](tests/git-command-test-harness.mapping.l1.test.ts))

### Compliance

- ALWAYS: `runGit` and `readGit` invoke git subprocesses with an explicitly built environment, so ambient Git environment does not leak into fixture subprocesses ([test](tests/git-command-test-harness.compliance.l1.test.ts))
