---
id: 01a116a8-122d-7d3b-a3b7-2fb686f79db7
---

# Change Runs

PROVIDES a read-only listing of the typed verification runs recorded for one Change, drawn from every branch scope of the shared local store and grouped by verification type
SO THAT gate drivers, Change holders, and launchers that count the verification runs a Change received
CAN read each verification type's runs for a Change, and how each run ended, from the run journal whichever branch, worktree, or holder started it

## Assertions

- ALWAYS: a run whose run-context event records the Change identity but which has no recorded-input sidecar appears in that Change's listing, and the listing never fails because of it: the listed run carries the run token, verification type, drive mode, sealed state, terminal status, and finding count per disposition its event history yields, and reports its scope type, scope identity, and changeset head commit as absent, because only the recorded-input sidecar carries them

### Scenarios

- Given runs started for one Change on two branches and on a detached head, beside a run started for another Change and a run started without a Change identity, when the listing is requested for the first Change, then it returns exactly the first Change's runs, grouped by verification type ([test](tests/change-runs.scenario.l1.test.ts))

### Mappings

- ALWAYS: each listed run carries its run token, verification type, drive mode, sealed state, terminal status when present, and finding count per disposition, and a listed run that has a recorded-input sidecar also carries its scope type, scope identity, and the head commit of a changeset scope ([test](tests/change-runs.mapping.l1.test.ts))

### Conformance

- ALWAYS: each listed run's sealed state, terminal status, and finding counts are folded from the run's event history through the terminal projection, so they equal what `status` reports for that run ([test](tests/change-runs.conformance.l1.test.ts))

### Compliance

- ALWAYS: a listing for a Change returns only runs whose run-context event records that Change identity verbatim, so a run started without a Change identity appears in no Change's listing ([test](tests/change-runs.compliance.l1.test.ts))
- ALWAYS: a listing reads every branch scope under `.spx/branch/` at the Git common-dir product root, including a scope a detached head names by its commit, from the local store without network access, so a Change's runs stay listed after its branch is renamed, rebased into a successor, or detached ([test](tests/change-runs.compliance.l1.test.ts))
- NEVER: a listing carries a run's finding payloads; a run's findings stay in its rendered projection ([test](tests/change-runs.compliance.l1.test.ts))
