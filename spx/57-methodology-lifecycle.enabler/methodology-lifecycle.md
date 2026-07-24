# Methodology Lifecycle

PROVIDES exact methodology identity inspection and isolated managed methodology migration
SO THAT products and coding agents operating across configuration, harness capabilities, diagnostics, verification, and agent sessions
CAN understand compatibility and migrate product truth without routine tooling updates rewriting it

## Assertions

### Scenarios

- Given a product declares an exact methodology version, when methodology identity is inspected, then the result reports the declaration, managed instruction markers, installed Spec Tree package compatibility, and any mismatch without mutation or required network access ([test](tests/methodology-show.scenario.l1.test.ts))
- Given a target methodology version, when managed migration starts, then SPX resolves the target methodology package in isolated harness state and launches that target methodology's migration coding agent without changing the invoking coding agent's state ([test](tests/methodology-migration.scenario.l1.test.ts))

### Conformance

- A completed methodology migration conforms to a successful sealed target-methodology verification run bound to the migration's target methodology, branch and head changeset, resolved configuration identity, and coding-agent session identity, with matching product configuration, instruction markers, installed Spec Tree package, and session closure ([test](tests/migration-completion.conformance.l1.test.ts))

### Compliance

- ALWAYS: an interrupted methodology migration preserves its branch, working changes, append-only run journal, and resumable coding-agent session while remaining incomplete ([test](tests/migration-interruption.compliance.l1.test.ts))
- NEVER: SPX executable updates or coding-agent capability status, apply, or update operations change methodology identity or managed instruction markers ([test](tests/methodology-command-boundary.compliance.l1.test.ts))
- NEVER: an SPX handoff session substitutes for the native coding-agent session identity a methodology migration resumes or closes ([audit])
- ALWAYS: the target methodology owns semantic migration decisions and semantic verification of the resulting product truth ([audit])
- NEVER: SPX infers or mechanically rewrites product truth under `spx/` as a substitute for the target methodology's migration workflow ([audit])
