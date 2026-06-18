# GitHub CI Integration

PROVIDES GitHub Actions integration for deterministic verification, release publication, dependency security checks, security scorecards, and agentic verdict-mode runs — including CI entrypoints for validation, testing, reviewing, and auditing, plus a Snapshot journal backend that publishes run projections to GitHub-native surfaces
SO THAT source and release checks, audit and review runs, dependency policy checks, and security scorecards executing in GitHub Actions
CAN run under names aligned with the verification taxonomy, keep full validation and testing out of local push hooks, and surface agentic run event-journal projections as PR comments, Actions artifacts, and Actions cache entries without the journal library holding GitHub-specific I/O

## Assertions

### Compliance

- ALWAYS: GitHub Actions workflow, job, and step names identify deterministic verification work with the taxonomy terms Validation and Testing, and reserve Reviewing and Auditing for agentic verdict-mode workflows ([audit])
- ALWAYS: package build, package-content, release-tag, dependency security, and scorecard steps use non-verification names rather than generic "verify" labels ([audit])
- ALWAYS: GitHub Actions integration for agentic verdict-mode runs — the Snapshot journal backend and the audit and review CI entrypoints — is governed under this node, not inside the journal library or a consuming verdict-mode domain ([audit])
- ALWAYS: GitHub integration consumes the agent-run journal only through its published backend port and projection contract, adding no run-state vocabulary of its own ([audit])
