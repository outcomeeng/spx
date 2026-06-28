# GitHub CI Integration

PROVIDES GitHub Actions integration for deterministic verification, release publication, dependency security checks, security scorecards, and agentic verdict-mode runs — including CI entrypoints for validation and testing, plus a GitHub Appendable journal store whose per-run artifact naming and prior-run hydration let the verification workflow durably retain agentic verification run event histories, and a Snapshot backend that publishes their projections to GitHub-native surfaces
SO THAT source and release checks, agentic verification runs, dependency policy checks, and security scorecards executing in GitHub Actions
CAN run under names aligned with the verification taxonomy, keep full validation and testing out of local push hooks, and durably retain agentic run event histories as Actions artifacts through the verification workflow's upload and download steps while surfacing their projections as PR comments, without the journal library holding GitHub-specific I/O

## Assertions

### Compliance

- ALWAYS: GitHub Actions verification workflows carry their verdict-mode name — Deterministic Verification for the validate-and-test lanes, Agentic Verification for the audit-and-review lanes — with the deterministic workflow's jobs and steps identifying validation and test work, and the agentic workflow carrying no spx-assigned verification-kind name ([audit])
- ALWAYS: package build, package-content, release-tag, dependency security, and scorecard steps use non-verification names rather than generic "verify" labels ([audit])
- ALWAYS: GitHub Actions integration for agentic verdict-mode runs — the GitHub Appendable journal store whose naming and hydration back the workflow's durable retention of run event histories, and the Snapshot backend that publishes their projections — is governed under this node, not inside the journal library or a consuming verdict-mode domain ([audit])
- ALWAYS: GitHub integration consumes the agent-run journal only through its published backend port and projection contract, adding no run-state vocabulary of its own ([audit])
