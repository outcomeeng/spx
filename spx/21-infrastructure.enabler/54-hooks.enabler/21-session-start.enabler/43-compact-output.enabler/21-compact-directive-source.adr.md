# Compact Directive Source

The compact-source `session-start` stdout directive is methodology content: its bytes are the manifest-named compact-recovery resource of the installed methodology package, resolved through the payload product's top-level `methodology` config descriptor — the same package identity `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md` binds for the understand payload. The foundation-resource manifest carries the resource as an optional `compact_recovery` entry — a package-relative path additive within schema version 1 — and an unresolved directive produces no compact-source stdout: the hook records a stderr diagnostic naming the failed resolution step and completes successfully. spx embeds no directive text.

## Rationale

The directive tells an agent how to recover methodology context after compaction, which makes its content methodology truth: which skills to re-invoke, in what scope, with which exemptions, is decided by the methodology that ships those skills. A directive embedded in spx is a second copy of that truth whose currency depends on an spx release — the copy-drift problem the published manifest exists to close — so the directive rides the same installed-package channel as the foundation itself. Reading the resource keeps the hook offline and deterministic: identical installed resources and identical configuration produce byte-identical stdout.

The directive resource is UTF-8 text and its read decodes strictly: a resource that is not valid UTF-8 resolves as unreadable rather than emitting replacement characters, so the byte-equality invariant is total over emitted output. Substituted fallback text is rejected because any spx-authored recovery wording is methodology guidance the methodology did not author — a snapshot in disguise that drifts exactly like the embedded directive it replaces. Silence is the correct degraded output: the compact stdout channel carries model-visible methodology context or nothing, and the stderr diagnostic keeps the missing directive observable to the operator without teaching the model stale guidance. An inline manifest string field is rejected in favor of a resource path because every other manifest entry names a package-relative resource, and a file lets the methodology govern, review, and version the directive content as an ordinary shipped artifact.

Resolution composes existing boundaries rather than growing hook-local plumbing. Manifest parsing, the schema-version gate, and package-relative path validation stay in the shared methodology library, where the optional entry parses under the same rules as every other entry and an absent entry remains a valid schema-1 manifest. Reading a manifest-named resource through the installed-package containment boundary — through any symbolic link — is shared capability behavior consumed by both the spec-context command and the hook adapter, so it lives behind the methodology library's public surface per `spx/14-cli-composition.adr.md`; a hook-local re-derivation of manifest location or containment is rejected as the duplicated-capability shape that decision forbids. The hook adapter reaches the installed package only through an injected reader boundary, per `spx/21-infrastructure.enabler/54-hooks.enabler/32-hook-interface-architecture.adr.md`, and the domain mapping from policy and resolved directive to emitted stdout stays a pure function.

Ordering follows cost and ownership: the compact stdout policy resolves first, and directive resolution runs only for a compact-source invocation whose policy is true, so a policy-false runtime never touches the installed package.

## Invariants

- Identical installed methodology resources and identical product configuration produce byte-identical compact-source stdout.
- Emitted compact-source stdout equals the exact bytes of the manifest-named compact-recovery resource.
- Compact-source stdout is emitted only when the compact stdout policy is true and the directive resolved; every other combination emits nothing.
- An unresolved directive never fails the hook invocation.

## Verification

### Testing

- ALWAYS: emitted compact-source stdout equals the exact bytes of the manifest-named compact-recovery resource of the installed methodology package resolved through the payload product's top-level `methodology` config descriptor ([conformance])
- ALWAYS: every unresolved-directive condition — an unconfigured package location, an absent, unreadable, or invalid manifest, an absent `compact_recovery` entry, and an uncontained or unreadable resource — yields no compact-source stdout, a stderr diagnostic naming the failed resolution step, and successful hook completion ([mapping])
- NEVER: directive resolution reads the installed package for an invocation whose compact stdout policy resolved false or whose lifecycle source is not compact ([compliance])

### Audit

- NEVER: spx source, configuration defaults, or generated output embed compact-recovery directive text as a literal, default, or fallback ([audit])
- ALWAYS: the optional `compact_recovery` manifest entry parses in the shared methodology library under the same package-relative path validation as every other entry, and an absent entry leaves a schema-1 manifest valid ([audit])
- ALWAYS: the directive resource path resolves through the installed-package containment boundary — through any symbolic link — before its bytes are read ([audit])
- ALWAYS: installed-package manifest and resource reads enter the hook adapter through an injected reader boundary, so directive resolution verifies over temp-directory fixtures without an installed plugin ([audit])
- ALWAYS: manifest-named resource reading with containment is exposed once behind the methodology library's public surface and consumed there by the spec-context command and the hook adapter ([audit])
- NEVER: an unresolved directive substitutes alternative stdout content for the compact source ([audit])
- ALWAYS: the domain mapping from compact stdout policy and resolved directive to emitted stdout is a pure function over supplied values ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem module replacement substitutes for the injected reader boundary in tests ([audit])
