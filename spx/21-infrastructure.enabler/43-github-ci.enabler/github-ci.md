# GitHub CI Integration

PROVIDES GitHub Actions integration for agentic verdict-mode runs — a Snapshot journal backend that publishes run projections to GitHub-native surfaces, and the CI entrypoints that run audit and review under Actions
SO THAT audit and review runs executing in GitHub Actions
CAN surface each run's event-journal projections as PR comments, Actions artifacts, and Actions cache entries without the journal library holding GitHub-specific I/O

## Assertions

### Compliance

- ALWAYS: GitHub Actions integration for agentic verdict-mode runs — the Snapshot journal backend and the audit and review CI entrypoints — is governed under this node, not inside the journal library or a consuming verdict-mode domain ([audit])
- ALWAYS: GitHub integration consumes the agent-run journal only through its published backend port and projection contract, adding no run-state vocabulary of its own ([audit])
