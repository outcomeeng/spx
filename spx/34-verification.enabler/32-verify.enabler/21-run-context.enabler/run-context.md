---
id: 01a115e6-be87-7cd9-b001-39f73f7bdd6d
---

# Run Context

PROVIDES start-time verification context creation, run-token selection, run-locator and resolved-scope reporting, changeset and file scope resolution, recorded-input replay, and recording of the run's head commit and of the Change a run serves for typed verification runs
SO THAT evidence append and terminal projection lifecycle operations
CAN operate on one scoped verification run with a stable subject, recorded input, unambiguous run identity, the head commit the run judges, and the Change identity the run was started for

## Assertions

- ALWAYS: `start` records the run's head commit for every scope type, the `file` scope included

### Scenarios

- Given a review verification run is started for a changeset scope with standard input as the run input, then spx creates a canonical verification context, opens a run journal, and reports the run token, context digest, resolved scope, exact input descriptor, and run locator ([test](tests/verify-start.scenario.l1.test.ts))
- Given an audit verification run is started for a file scope, then spx records a verification-context file subject and reports the normalized product-relative file as the resolved scope without requiring that path to exist or be tracked ([test](tests/verify-file-scope.scenario.l1.test.ts))
- Given a started run, when recorded-input replay is requested with that run token, then it returns the exact verification input whose digest was recorded at start ([test](tests/verify-input.scenario.l1.test.ts))
- Given a verification run is started with a Change identity in the canonical `owner/repo#N` form, then `start` records that identity verbatim on the verify-owned run-context event that carries the run's drive mode, and `status` reports that identity for the run ([test](tests/verify-change-identity.scenario.l1.test.ts))
- Given a verification run is started without a Change identity, then its run-context event records no Change identity and `status` reports none for the run, so the run belongs to no Change ([test](tests/verify-change-identity.scenario.l1.test.ts))

### Properties

- For all changeset ranges, the `changeset` scope type resolves `base` and `head` into verification-context reconstruction fields and derives changed product paths as run scope metadata outside the canonical verification context ([test](tests/verify-scope.property.l1.test.ts))
- For all file-scope identities, normalization is deterministic and idempotent, accepts safe product-relative paths without filesystem-existence or git-tracking input, and rejects absolute paths, empty identities, and parent-directory escapes ([test](tests/verify-file-scope.property.l1.test.ts))
- For all resolved verification selectors, a run locator preserves the verification type, scope type, scope identity, backend identity, storage namespace, and journal run path or backend target with the run token reported by `start` ([test](tests/verify-scope.property.l1.test.ts))
- For all scope types outside the supported scope types, `start` rejects the run as an unsupported scope type ([test](tests/verify-scope.property.l1.test.ts))

### Mappings

- Supported scope types map to reconstructable verification-context subjects and `resolvedScope` reports: `changeset` maps a `<base>..<head>` selector to base/head reconstruction fields plus changed product paths, while `file` maps one normalized product-relative path to a file subject plus that path ([test](tests/verify-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: start records caller-driven drive mode for the caller command path and records spx-driven drive mode only when spx opens the run ([test](tests/verify-drive-mode.compliance.l1.test.ts))
- ALWAYS: start requires an input source and records the verification input for recorded-input replay ([test](tests/verify-start.compliance.l1.test.ts))
- ALWAYS: `start` rejects an unsupported verification type before any started run exists, so an unregistered type cannot reach finding evidence and append an unvalidated finding ([test](tests/verify-start.compliance.l1.test.ts))
- ALWAYS: `start` rejects a Change identity outside the canonical `owner/repo#N` form — an owner, a repository name, and a positive issue number — before any run exists, so no verification context, run journal, or run-context event is created for it ([test](tests/verify-change-identity.compliance.l1.test.ts))
- ALWAYS: recorded-input replay requires a run token and rejects ambiguous type/scope-only selection ([test](tests/verify-input.compliance.l1.test.ts))
- ALWAYS: when `input` cannot locate a run, the diagnostic names the requested run token, verification type, scope type, scope identity, backend identity, storage namespace, searched target, and selector inputs needed to address it ([test](tests/verify-input.compliance.l1.test.ts))
- NEVER: recorded-input replay reads a fresh input value instead of replaying the input recorded at start ([test](tests/verify-input.compliance.l1.test.ts))
