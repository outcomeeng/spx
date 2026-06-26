# Verification Path Scope

Verification commands that accept caller-selected product paths take those paths as positional operands, not through a `--files` flag or a verification-type-specific option. The operand vocabulary is shared across validation, testing, status refresh, and verification launchers that narrow work by product path: operands may name files or directories, resolve from the effective product invocation directory, and select only work the invoked verification surface owns.

## Rationale

Paths are already the noun a caller supplies, so repeating the noun as a flag adds ceremony and lets verification surfaces drift into incompatible scope models. A shared operand vocabulary keeps focused verification portable across validation, testing, and status-refresh workflows while leaving each surface responsible for mapping selected paths to its own executable work.

## Product properties

1. A caller narrows a verification command by appending product path operands after command options; omitting operands runs the command over its configured default scope.
2. File operands select the verification work that owns the file, and directory operands expand to the invoked surface's relevant product files or nodes before dispatch.
3. Surface-specific filtering, such as passing-scope exclusions or validation path filters, applies after explicit operand resolution and cannot silently erase an explicitly requested product path.

## Verification

### Testing

- ALWAYS: verification CLI surfaces that expose path-scoped execution accept zero or more positional product path operands after options, and omitted operands preserve unscoped default execution ([compliance])
- ALWAYS: directory operands expand to the invoked surface's relevant product files or nodes before runner, tool, or status-refresh dispatch ([compliance])
- ALWAYS: explicit path operands resolve before surface-specific filters, so filters can report or narrow execution without silently discarding caller intent ([compliance])
- NEVER: introduce a verification path-scope flag such as `--files`, `--tests`, or `--nodes` when positional operands express the same product path scope ([compliance])

### Audit

- ALWAYS: every verification surface reuses the positional product path operand vocabulary unless its scoped subject is not a product path ([audit])
