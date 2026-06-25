# Verification Context

PROVIDES the `spx verification-context create` command and canonical context document for one verification request, scoped by caller-supplied subject, predicate, requested workflow, launch context, and persistence intent
SO THAT external launchers, CI jobs, and agentic verification skills
CAN pass a stable, digest-addressed verification input to a verifier and reconstruct later what was verified, how to reconstruct the subject, which predicate was requested, where the result should persist, and which static context launched the workflow without embedding runtime outcome data or verification-type vocabulary in spx

## Assertions

### Scenarios

- Given a file subject with a product-relative path and a predicate, when `spx verification-context create` runs, then it writes a canonical context document and reports the context path and digest ([test](tests/verification-context-cli.scenario.l1.test.ts))
- Given a verification context path already exists, when `spx verification-context create` runs for that request, then matching canonical content reports the same path and digest while divergent content returns a content-mismatch error ([test](tests/verification-context-cli.scenario.l1.test.ts))
- Given a file subject with an absolute path or parent-directory escape, when `spx verification-context create` runs, then it rejects the subject before persistence ([test](tests/verification-context-cli.scenario.l1.test.ts))
- Given a changeset subject with base and head refs and a predicate, when `spx verification-context create` runs, then the context records the changeset reconstruction fields and reports the context path and digest ([test](tests/verification-context-cli.scenario.l1.test.ts))
- Given the verification-context domain in the CLI registry, when it registers with the program, then the `verification-context` command exposes exactly the `create` verb ([test](tests/verification-context-cli-registry.scenario.l1.test.ts))

### Properties

- A verification context's local persistence path is `.spx/branch/<branch-slug>/verification-context/contexts/context-<digest>.json` at the Git common-dir product root, with `<branch-slug>` from the state-store slug of `SPX_VERIFY_BRANCH` or the current branch and `<digest>` from the canonical context payload ([test](tests/verification-context-path.property.l1.test.ts))
- A verification context digest is deterministic for the same subject, predicate, workflow, launch context, and persistence intent, and changes when any of those fields changes ([test](tests/verification-context-digest.property.l1.test.ts))

### Compliance

- ALWAYS: persisted verification context is pre-execution input — it excludes terminal verdict, activity trace, runtime cost, and run status ([test](tests/verification-context-shape.compliance.l1.test.ts))
- NEVER: `verification-context` creation spawns, configures, or drives a verifier agent ([audit])
- NEVER: `verification-context` exposes verification-type subcommands such as `audit` or `review`; predicate and workflow are caller-supplied strings ([audit])
