---
id: 01a115e6-be87-7cd9-b001-39f73f7bdd6d
---

# Run Context

PROVIDES start-time verification context creation, run-token selection, run-locator and resolved-scope reporting, changeset and file scope resolution, recorded-input content digests and the content-identity expectation and check against them, recorded-input replay, and recording of the run's head commit when the product is a Git repository whose HEAD names a commit, of the Change a run serves, and of the Verifier that judges the run for typed verification runs, the change inventory of every changeset-scoped run, and the expectations a changeset-scoped run is bound to
SO THAT evidence append, scope reconciliation, and terminal projection lifecycle operations
CAN operate on one scoped verification run with a stable subject, recorded input and its content identity, unambiguous run identity, the head commit the run judges whenever the product is a Git repository whose HEAD names a commit, the Change identity the run was started for, the Verifier the run was started with, the change inventory the run started over, and the expectations the run is bound to

## Assertions

### Scenarios

- Given a verification run started with a Verifier, when the run starts, then the run-context event records the Verifier's kind and id and `status` reports them ([test](tests/verify-verifier.scenario.l1.test.ts))
- Given a review verification run is started for a changeset scope with standard input as the run input, then spx creates a canonical verification context, opens a run journal, and reports the run token, context digest, resolved scope, exact input descriptor, and run locator ([test](tests/verify-start.scenario.l1.test.ts))
- Given an audit verification run is started for a file scope, then spx records a verification-context file subject and reports the normalized product-relative file as the resolved scope without requiring that path to exist or be tracked ([test](tests/verify-file-scope.scenario.l1.test.ts))
- Given a started run, when recorded-input replay is requested with that run token, then it returns the exact verification input whose digest was recorded at start ([test](tests/verify-input.scenario.l1.test.ts))
- Given a verification run is started with a Change identity in the canonical `owner/repo#N` form, then `start` records that identity verbatim on the verify-owned run-context event that carries the run's drive mode, and `status` reports that identity for the run ([test](tests/verify-change-identity.scenario.l1.test.ts))
- Given a verification run is started without a Change identity, then its run-context event records no Change identity and `status` reports none for the run, so the run belongs to no Change ([test](tests/verify-change-identity.scenario.l1.test.ts))

### Properties

- ALWAYS: `start` digests the bytes its input reader returns, records their recorded-input content as the UTF-8 decoding of those bytes, and records their `contentDigests` — `none`, and `utf8-universal-newlines` with its version when those bytes are valid UTF-8 — in the input descriptor beside `digest`, in the recorded-input sidecar, and in the start report's `input`; a `start` without an expected content digest opens the run as one without the option does ([test](tests/verify-start-content-identity.property.l1.test.ts))
- For all changeset ranges, the `changeset` scope type resolves `base` and `head` into verification-context reconstruction fields and derives changed product paths as run scope metadata outside the canonical verification context ([test](tests/verify-scope.property.l1.test.ts))
- For all file-scope identities, normalization is deterministic and idempotent, accepts safe product-relative paths without filesystem-existence or git-tracking input, and rejects absolute paths, empty identities, and parent-directory escapes ([test](tests/verify-file-scope.property.l1.test.ts))
- For all resolved verification selectors, a run locator preserves the verification type, scope type, scope identity, backend identity, storage namespace, and journal run path or backend target with the run token reported by `start` ([test](tests/verify-scope.property.l1.test.ts))
- For all scope types outside the supported scope types, `start` rejects the run as an unsupported scope type ([test](tests/verify-scope.property.l1.test.ts))

### Mappings

- Recorded-input replay given a file to check reads that file's bytes from its path resolved against the effective invocation directory and maps their digest, under the named content normalization, `none` when none is named, against the digest recorded at start to a result whose `result` is `equal` or `different` and which carries `expected`, `observed`, `normalization`, `normalizationVersion` for `utf8-universal-newlines`, and the recorded `source`, whatever the checked file's name ([test](tests/verify-input-check.mapping.l1.test.ts))
- Supported scope types map to reconstructable verification-context subjects and `resolvedScope` reports: `changeset` maps a `<base>..<head>` selector to base/head reconstruction fields plus changed product paths, while `file` maps one normalized product-relative path to a file subject plus that path ([test](tests/verify-scope.mapping.l1.test.ts))
- ALWAYS: when the product is a Git repository whose HEAD names a commit, `start` records the run's head commit for every scope type, the `file` scope included; where the product has no commit to name — outside a Git repository, or in a Git repository whose HEAD is unborn — a `file`-scope `start` records no head commit and still opens the run ([test](tests/verify-head-commit.mapping.l1.test.ts))
- ALWAYS: `start` of a changeset-scoped run records on its run-context event the run's change inventory — one entry carrying `path` and `changeKind` for every path its changeset changes between base and head, where an added path is `added`, a modified path and a type change are `modified`, a deleted path is `deleted`, a rename contributes its base-side path as `deleted` and its head-side path as `added`, and a copy contributes its head-side path as `added` and its base-side path, which the head still holds, as `copy-source` — so later lifecycle operations read the inventory the run started over ([test](tests/verify-change-inventory.mapping.l1.test.ts))

### Compliance

- ALWAYS: `start` given an expected content SHA-256 compares it, under the named content normalization, `none` when none is named, with the digest of the bytes it captures, and before any verification context, run journal, or run-context event exists rejects an expected digest that is not 64 lowercase hexadecimal characters naming the option, a content normalization named without an expected digest naming both options, a difference naming both digests, and captured bytes that are not valid UTF-8 under `utf8-universal-newlines` naming that normalization and its version ([test](tests/verify-start-expected-digest.compliance.l1.test.ts))
- ALWAYS: recorded-input replay given a file to check reports `content-identity-unavailable` for a run whose start recorded no content digest under the named normalization, `normalization-failed` naming the normalization and its version for a checked file that is not valid UTF-8 under `utf8-universal-newlines`, and `check-file-unreadable` naming the path for a file it cannot read, never `different`; a content normalization named without a file to check is rejected; and replay without a file to check returns the recorded input unchanged ([test](tests/verify-input-check.compliance.l1.test.ts))
- ALWAYS: `start` given expectations — a JSON object carrying `schemaVersion` `1` and an optional `additionalPaths` array of product-relative paths, absent meaning none — records them on the run's run-context event, and rejects before any run exists an expectations document that is not such an object or whose schema version is unsupported, a run that is not changeset-scoped, or a declared additional path that is not a product-relative path the head commit holds, naming the field or the path ([test](tests/verify-expectations.compliance.l1.test.ts))
- ALWAYS: `start` rejects a Verifier whose kind is neither `person` nor `agent`, or whose id is empty or only whitespace, before any run exists ([test](tests/verify-verifier.compliance.l1.test.ts))
- ALWAYS: start records caller-driven drive mode for the caller command path and records spx-driven drive mode only when spx opens the run ([test](tests/verify-drive-mode.compliance.l1.test.ts))
- ALWAYS: start requires an input source and records the verification input for recorded-input replay ([test](tests/verify-start.compliance.l1.test.ts))
- ALWAYS: `start` rejects an unsupported verification type before any started run exists, so an unregistered type cannot reach finding evidence and append an unvalidated finding ([test](tests/verify-start.compliance.l1.test.ts))
- ALWAYS: `start` rejects a Change identity outside the canonical `owner/repo#N` form — an owner, a repository name, and a positive issue number — before any run exists, so no verification context, run journal, or run-context event is created for it ([test](tests/verify-change-identity.compliance.l1.test.ts))
- ALWAYS: recorded-input replay requires a run token and rejects ambiguous type/scope-only selection ([test](tests/verify-input.compliance.l1.test.ts))
- ALWAYS: when `input` cannot locate a run, the diagnostic names the requested run token, verification type, scope type, scope identity, backend identity, storage namespace, searched target, and selector inputs needed to address it ([test](tests/verify-input.compliance.l1.test.ts))
- NEVER: recorded-input replay reads a fresh input value instead of replaying the input recorded at start ([test](tests/verify-input.compliance.l1.test.ts))
