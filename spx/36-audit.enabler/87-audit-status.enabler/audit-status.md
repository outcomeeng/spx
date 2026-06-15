# Audit Status

PROVIDES audit list, status, and latest-run reporting over branch-scoped audit state
SO THAT agents and developers
CAN inspect audit evidence without re-running auditors

## Assertions

### Compliance

- ALWAYS: audit status reads sealed run journals and incomplete runs from `.spx/branch/{branch-slug}/audit/`, folding each run's `AuditRunState` projection per `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
- ALWAYS: persisted machine statuses render through the explicit display mapping from `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
- ALWAYS: incomplete runs are visible to operators without satisfying approved or rejected status ([audit])
- NEVER: treat an unsealed run, or a sealed run whose history holds no terminal-completion event, as approved or rejected status evidence ([audit])
