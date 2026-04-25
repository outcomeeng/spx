# Verify

PROVIDES the `spx audit verify <file>` command — a sequential four-stage pipeline (reader → structural → semantic → paths) that validates an audit verdict XML file and reports defects grouped by stage
SO THAT the audit CLI
CAN present a structured, actionable verdict on whether a recorded audit is internally consistent and references real files

## Assertions

### Scenarios

- Given a well-formed audit verdict XML file with coherent gate statuses, when `spx audit verify <file>` runs, then all four stages pass and the command exits 0 ([test](tests/verify.scenario.l1.test.ts))
- Given an audit verdict XML file that fails structural validation, when `spx audit verify <file>` runs, then structural defects appear in stdout and no `semantic:` or `paths:` prefixed lines appear in stdout ([test](tests/verify.scenario.l1.test.ts))
- Given an audit verdict XML file that passes structural validation but fails semantic validation, when `spx audit verify <file>` runs, then semantic defects appear in stdout and no `paths:` prefixed lines appear in stdout ([test](tests/verify.scenario.l1.test.ts))
- Given an audit verdict XML file whose paths reference non-existent files, when `spx audit verify <file>` runs, then path defects are reported and the command exits 1 ([test](tests/verify.scenario.l1.test.ts))
- Given `spx audit verify` is run with a verdict XML file located outside `.spx/nodes/`, when the file is valid, then the command processes it normally and exits 0 ([test](tests/verify.scenario.l1.test.ts))

### Mappings

- For each stage in the ordered sequence (reader, structural, semantic, paths), when that stage reports defects, then all subsequent stage names are absent from stdout ([test](tests/verify.scenario.l1.test.ts))

### Properties

- The pipeline is deterministic: for all syntactically valid audit verdict XML strings with any combination of gate statuses and finding counts, the same input always produces the same stage results and exit code ([test](tests/verify.property.l1.test.ts))

### Conformance

- Each defect line in stdout conforms to `{stage}: {defect-message}` where `{stage}` is one of `reader`, `structural`, `semantic`, `paths` ([test](tests/verify.scenario.l1.test.ts))

### Compliance

- ALWAYS: exit 0 when all stages pass; exit 1 when any stage fails ([test](tests/verify.scenario.l1.test.ts))
- NEVER: modify the verdict file or write any output to the filesystem ([review])
