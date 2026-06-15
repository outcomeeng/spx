# Audit

PROVIDES the `spx audit` command family — config-backed, branch-scoped lifecycle for the audit runs produced by executing configured auditors: resolving and running auditors, persisting each run as an append-only event journal, and reporting verdicts and history by branch
SO THAT CI pipelines, agents, and developers running `spx audit`
CAN execute and inspect hermetically recorded audit evidence for the current branch before acting on it

## Assertions

### Compliance

- ALWAYS: `spx audit` resolves auditors, targets, and base ref from the audit descriptor and records each run under `.spx/branch/{branch-slug}/audit/` as an append-only event journal per `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
- ALWAYS: list and status report a branch's audit verdicts and history by folding recorded run journals, without re-running the auditors ([audit])
- ALWAYS: audit configuration resolves through a registered descriptor in the `spx/16-config.enabler/` config system per `spx/16-config.enabler/21-descriptor-registration.adr.md` ([audit])
- NEVER: write audit evidence into the spec tree — runs persist only under `.spx/branch/{branch-slug}/audit/` per `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
- NEVER: persist a run as anything but an append-only event journal — no write-once terminal record and no verdict-XML artifact ([audit])
