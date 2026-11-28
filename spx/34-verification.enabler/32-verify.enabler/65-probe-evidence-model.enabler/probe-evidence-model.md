---
malleability: implementation
---

# Probe Evidence Model

PROVIDES the `probe` verification type: validation of the protocol a probe run executes, the Assertions it observes, the artifacts it retains and the areas it leaves unexercised, of the findings that record a departure, and of the Author's attested terminal verdict
SO THAT an Author, person or agent, that ran a Probe's protocol
CAN record and seal that attested run under `--verification-type probe` as a Verification Run, with every payload that breaks the probe form refused before it reaches the journal

## Assertions

### Test.Scenario: attested run

- [probe-run-seals](tests/probe-run.scenario.l1.test.ts):
  - Given a probe run started under `--verification-type probe` on the file scope of a `probe.md` inside a Node's `probes/` directory
  - When its `protocol` unit, an `assertion` unit and an `artifact` unit are added as scope evidence, and `finish` records `passed`
  - Then the run seals `passed`, and `status` reports verification type `probe`, the sealed state and terminal status `passed`

### Test.Mapping: [probe-scope-units](tests/probe-scope-units.mapping.l1.test.ts)

A probe scope unit carries `unitKind`, its unit kind, and `subject`, a product-relative path, and the probe scope validator maps each `unitKind` value to the further field a unit of that kind requires.

| Case        | Further field                                          |
| ----------- | ------------------------------------------------------ |
| protocol    | none                                                   |
| assertion   | `slug`, the slug of the row it observes in its subject |
| artifact    | none                                                   |
| unexercised | `reason`, why the run left that row or area out        |

### Test.Mapping: [probe-terminal](tests/probe-terminal.mapping.l1.test.ts)

The probe terminal validator maps the terminal status the Author supplies, and the findings the run recorded, to what `finish` does.

| Case                | Terminal status                         | Findings recorded | `finish`                                                     |
| ------------------- | --------------------------------------- | ----------------- | ------------------------------------------------------------ |
| passed-clean        | `passed`                                | none              | seals `passed`                                               |
| passed-with-finding | `passed`                                | at least one      | refuses, naming `failed` as the status the evidence requires |
| failed-with-finding | `failed`                                | at least one      | seals `failed`                                               |
| failed-clean        | `failed`                                | none              | refuses, naming `passed` as the status the evidence requires |
| foreign-status      | `approved`, `rejected` or `interrupted` | any               | refuses, naming `passed` and `failed`                        |

### Test.Compliance: probe payloads

- [probe-type-registered](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: `probe` is a verification type of `spx verification run` that registers scope, finding and terminal validators, so `start`, `scope add`, `finding add` and `finish` accept a probe run and `status` advertises `scope add` and `finding add` for an unsealed one.
- [protocol-root](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: a probe run accepts its first scope unit only when the run is file-scoped and the unit is a `protocol` unit whose subject equals the run's file scope and names a `probe.md` directly inside a directory under a Node's `probes/`, and it refuses a `protocol` unit as any later unit.
- [artifact-retained](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: an `artifact` unit's `subject` names a file directly inside the directory of the run's `protocol` unit, in the probe-artifact form `<slug>.<ext>`, other than `probe.md`; the probe scope validator refuses an `artifact` unit whose `subject` lies under that directory's `runs/` or in any other subdirectory of it, and `finish` refuses a probe run that recorded no `artifact` unit, so every sealed probe run retains an artifact separate from its protocol.
- [assertion-observed](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: `finish` refuses a probe run that recorded no `assertion` unit, so every sealed probe run names an Assertion it observed.
- [observed-paths](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: a probe scope unit accepts the type-neutral `judgedPaths` field naming the implementation files the run observed and each lockfile its run used, and the sealed run records those files among the files it judged.
- [departure-finding](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: a probe finding carries `assertionSubject` and `slug`, the `subject` and `slug` of an `assertion` unit recorded in the run; `artifactSubject`, the `subject` of an `artifact` unit recorded in the run that shows the departure; `message`; and `evidence`, holding `observed`, the observation, and `expected`, the expectation.
- [field-named-refusal](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: a probe scope or finding payload that breaks the probe form is refused before any journal event appends, and the reason names the failing payload field path.
- [no-terminal-metadata](tests/probe-payloads.compliance.l1.test.ts): ALWAYS: probe `finish` refuses supplied terminal metadata, so the Author's verdict is the terminal status alone.
