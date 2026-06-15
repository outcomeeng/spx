# Session List JSON Contract

The `session list` and `session todo` JSON output is a flat per-session record — `id` and `status` alongside the frontmatter fields of [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md), excluding the absolute file path — and `--fields` projects that record over a source-owned field registry through a pure domain function, emitting only the named fields in caller order and rejecting any unknown field name.

## Rationale

The JSON output is a machine contract a frequently-run consumer parses, so it keys each field by a source-owned name and lets the caller request exactly the subset it needs, keeping token cost minimal on a hot path. A flat record excludes the absolute filesystem path because sessions are addressed by `id` and a path leaks a layout that does not survive a different checkout. One source-owned registry — `SESSION_FRONT_MATTER` extended with the record-only `id` and `status` keys — backs the record shape, the selection validator, and the projection together, so the selectable namespace cannot drift across the three per [`spx/36-session.enabler/37-frontmatter-key-enforcement.adr.md`](../37-frontmatter-key-enforcement.adr.md). Layer placement follows [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md): the projection and field-selection parsing are pure domain computation, the `--fields` option and stream writes are the descriptor's, and output assembly is the handler's.

Rejected: nesting the frontmatter fields under a `metadata` object (forces the consumer to couple to internal structure and complicates a flat projection); emitting the absolute filesystem path (leaks non-portable layout into a machine contract); validating field names against raw string literals (drifts from the source-owned registry per [`spx/36-session.enabler/37-frontmatter-key-enforcement.adr.md`](../37-frontmatter-key-enforcement.adr.md)); and a `--format <fmt>` option in place of `--json` (diverges from the `--json` convention every other spx domain and the `/pickup` skill already depend on).

## Invariants

- The projectable field set equals the source-owned record-field registry; the full record carries exactly that set, with optional fields present only when the session carries them.
- Projection is a pure function: the same record and the same selection produce the same output, and selecting every field equals the full record.
- A selection emits only the named fields, in the order named.

## Verification

### Testing

- ALWAYS: `session list` and `session todo` JSON output is a flat per-session record whose key set is the source-owned record-field registry, with optional fields present only when the session carries them ([scenario])
- ALWAYS: a `--fields` selection projects to exactly the named fields in the named order ([scenario])
- NEVER: the JSON output exposes the absolute filesystem path of a session ([compliance])
- NEVER: a `--fields` selection that names no valid field — a token outside the record-field registry, or a value naming no field at all — produces output; it is rejected, naming the offending value and the valid field set ([scenario])

### Audit

- ALWAYS: the projectable field registry extends `SESSION_FRONT_MATTER` with the record-only keys (`id`, `status`) as the single runtime source of truth, and every field-name read or comparison references that registry rather than a raw string literal per [`spx/36-session.enabler/37-frontmatter-key-enforcement.adr.md`](../37-frontmatter-key-enforcement.adr.md) ([audit])
- ALWAYS: field projection is a pure function over an in-memory session record, accepting the record and the selection as parameters with no filesystem or process access per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
- ALWAYS: the `--fields` Commander option and all stdout/stderr writes live in the session descriptor, output assembly in the command handler, and field-selection parsing and the projection in the domain per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
- NEVER: a test substitutes `vi.mock()` or `jest.mock()` for the projection's inputs — the pure function is exercised with real record values per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
