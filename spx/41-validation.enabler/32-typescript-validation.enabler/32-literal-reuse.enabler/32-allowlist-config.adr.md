# Allowlist Configuration

## Purpose

This decision governs how the literal-reuse detector resolves which literals to suppress from findings. It applies to `src/validation/literal/config.ts`, every consumer of `validateLiteralReuse`, and the `literalCommand` entry point that loads the project config and wires it into the detector.

## Context

**Business impact:** Every TypeScript project accumulates string literals that are noisy in a literal-reuse sense but carry no domain meaning in its context — HTTP verbs, HTML attribute names, framework-emitted tokens, common Node.js strings. A flat allowlist requires each project to enumerate these values individually; teams with similar stacks duplicate the same lists with slight variations and no sharing mechanism.

**Technical constraints:** The allowlist is resolved once per detection run from the project config, loaded via `resolveConfig(projectRoot)` per the descriptor pattern from `16-config.enabler`. The config section key must be stable and short. The effective allowlist is a set of `(kind, value)` pairs computed before any file is walked; late resolution per finding is not possible without re-running the config load inside the detection loop.

## Decision

The allowlist config is a structured object under the `"literal"` section with three optional fields:

- `presets`: array of named preset identifiers — each preset bundles a curated list of strings common to a particular ecosystem
- `include`: project-specific string values to add to the effective allowlist beyond what presets contribute
- `exclude`: string values to remove from the effective allowlist even if a preset or `include` would otherwise suppress them

The effective allowlist for a detection run is: **⋃(values in each named preset) ∪ include \ exclude**.

`exclude` wins unconditionally — a value in both `include` and `exclude` is not in the effective allowlist.

The built-in preset `"web"` bundles strings common to web-framework boilerplate: HTTP method names (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`), HTTP header names (`Content-Type`, `Authorization`, `Accept`), common response shape keys (`status`, `message`, `error`, `data`), and HTML attribute tokens (`class`, `id`, `href`, `src`, `type`, `name`, `value`).

`literalCommand` loads the project config via `resolveConfig(projectRoot, [literalConfigDescriptor])`, extracts the resolved `LiteralConfig` from the `"literal"` section, and passes it to `validateLiteralReuse` before any file is walked. The single-descriptor argument isolates this command from validation outcomes of other domains' sections. When `resolveConfig` returns an error, `literalCommand` exits non-zero with the error message and does not proceed to detection. `LiteralCommandOptions` accepts an optional `config?: LiteralConfig` for dependency injection in tests; when provided, `literalCommand` bypasses `resolveConfig`.

## Rationale

Presets let projects say "suppress web boilerplate" without enumerating every noisy token. Teams with the same stack share the same preset, and adding a new noisy token to a preset benefits all projects that include it.

The `include`/`exclude` split gives projects fine-grained control over preset behavior without forking it. A project where `"title"` is a domain-meaningful concept adds it to `exclude`; the preset continues to suppress other web tokens unchanged.

`exclude` wins over `include` because a project that explicitly names a value in `exclude` is asserting "this value is domain-meaningful here." That assertion should not be undone by any amount of preset or `include` configuration. The semantics must be predictable without tracing the evaluation order.

Alternatives considered:

- **Flat `allowlist: string[]`.** Rejected because every project must enumerate all noisy tokens individually, shared patterns across projects are not expressed, and there is no mechanism to reclaim a value from a broadly-suppressing list.
- **Preset-only (no include/exclude).** Rejected because it forces either over-suppression (preset includes domain values) or under-suppression (project cannot add its own noisy values without forking the preset). `include`/`exclude` are the per-project dials that make presets safe to adopt.
- **Priority-ordered list of allowlist sources (first match wins).** Rejected because the evaluation is non-obvious for values that appear in multiple sources; `exclude` as an unconditional override is simpler to reason about.

## Trade-offs accepted

| Trade-off                                                                          | Mitigation / reasoning                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preset maintenance burden as ecosystems evolve                                     | Presets are curated constants in the implementation; a new noisy token is a one-line addition; existing projects are unaffected unless they explicitly include the preset |
| `exclude` semantics may surprise users who expect it to remove only from `include` | Documentation and error messages describe `exclude` as applying to the full effective set; this removes the "which source did this come from?" question                   |
| Unknown preset names require validation at config load time                        | The `"literal"` section validator rejects any `presets` entry not in the registered preset registry; the error names the unrecognized identifier                          |
| Config loading adds an async FS operation at command startup                       | `resolveConfig` performs a single directory scan followed by at most one file read; the cost is bounded and exits early before any AST work begins                        |

## Invariants

- The effective allowlist is a set computed once per detection run before any file is walked.
- A value present in both `include` and `exclude` is NOT in the effective allowlist — `exclude` wins unconditionally.
- Unknown preset identifiers cause `resolveConfig` to return an error; the detection run does not proceed.

## Compliance

### Recognized by

The `"literal"` config section validator in `src/validation/literal/config.ts` accepts an object with optional `presets`, `include`, and `exclude` fields. No caller outside `src/config/` or descriptor modules references the section key as a string literal. `LiteralCommandOptions` carries a `config?: LiteralConfig` field; `literalCommand` calls `resolveConfig` only when that field is absent.

### MUST

- The config section key is `"literal"` — referenced via `LITERAL_SECTION` constant, never as an inline string ([review])
- The effective allowlist computation is: union(preset bundles for each named preset) ∪ include \ exclude — evaluated once before detection begins ([review])
- The section validator rejects any `presets` entry not found in the registered preset registry and returns an error naming the unrecognized identifier ([review])
- `exclude` removes a value from the effective allowlist regardless of which source contributed it ([review])
- `literalCommand` calls `resolveConfig(projectRoot, [literalConfigDescriptor])` before invoking `validateLiteralReuse` and passes the resolved literal config section as `config` — the allowlist from the project config file reaches the detector ([review])
- `literalCommand` exits non-zero with the config error message when `resolveConfig` returns `{ ok: false }` — detection does not proceed on config errors ([review])
- `LiteralCommandOptions` accepts `config?: LiteralConfig` — when provided, `literalCommand` skips `resolveConfig` and passes it directly, enabling `l1` tests without config file I/O ([review])

### NEVER

- Resolve the allowlist lazily per finding — the effective set is computed once per run ([review])
- Silently ignore an unrecognized preset name — unknown presets must produce a validation error ([review])
- Allow a value in both `include` and `exclude` to appear in the effective allowlist — `exclude` wins unconditionally ([review])
- Invoke `validateLiteralReuse` from `literalCommand` without first resolving the project's literal config — bypassing project config silently voids user-configured allowlist behavior ([review])
