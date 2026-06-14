# Plan

## Disable Dependabot security-update pull requests

The `dependency-updates` spec declares Renovate as the sole automated dependency-PR
tool, with Dependabot security updates disabled and Dependabot vulnerability alerts
retained as the advisory source Renovate consumes. The repository currently has the
`automated-security-fixes` setting enabled, so the declaration leads realization.

Dependabot security-update pull requests are governed by a repository setting, not by
a committable file, so the realization is a one-time API action run at merge — after
`renovate.json` reaches the default branch and the Renovate app onboards — so no
interval passes without an automated dependency-PR tool active:

```bash
gh api -X DELETE repos/outcomeeng/spx/automated-security-fixes
```

This disables Dependabot security-update pull requests while leaving Dependabot
vulnerability alerts enabled. Remove this note once the setting is disabled.
