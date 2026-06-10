# Audit Status

PROVIDES audit list, status, and latest-run reporting over branch-scoped audit state
SO THAT agents and developers
CAN inspect audit evidence without re-running auditors

## Assertions

### Compliance

- ALWAYS: audit status reads terminal `state.json` files and incomplete run directories from `.spx/audit/{branch-slug}` ([audit])
- ALWAYS: persisted machine statuses render through the explicit display mapping from `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
- ALWAYS: incomplete runs are visible to operators without satisfying approved or rejected status ([audit])
- NEVER: parse verdict XML to answer list, status, or latest-run metadata that exists in `state.json` ([audit])
