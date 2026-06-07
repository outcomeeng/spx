# Frontmatter Key Enforcement

Session frontmatter key usage is enforced by a custom ESLint rule that reports any string literal equal to a registered frontmatter key when it appears outside the `SESSION_FRONT_MATTER` registry definition module, so every key read or write stays tied to the one runtime source of truth.

## Rationale

The frontmatter schema is a closed vocabulary with a single runtime source of truth (`SESSION_FRONT_MATTER`), so enforcement belongs at edit time in the same validation path as the rest of the TypeScript quality gate — ESLint catches a duplicated key literal before it can drift from the canonical schema and make agents miss the work to resume. A grep-based compliance test is rejected because it reports only during test execution, cannot reason about AST context, and is harder to exempt for the registry definition itself; a shared test helper is rejected because it would reduce duplication in tests without preventing production call sites from drifting. The rule limits its reports to string-literal values whose text equals a registered key, and it exempts the file that defines `SESSION_FRONT_MATTER` so the source of truth is not flagged while every consumer references the exported registry.

## Verification

### Audit

- ALWAYS: reference `SESSION_FRONT_MATTER` for every session frontmatter key read or written outside the registry definition module — schema usage stays tied to the canonical runtime registry ([audit])
- ALWAYS: cover the custom ESLint rule with fixtures that include both a violating call site and the allowed registry definition module — proving the rule reports drift without flagging the source of truth ([audit])
- NEVER: spell a session frontmatter key as a raw string literal in any module outside the registry definition module — duplicated keys drift from `spx/36-session.enabler/11-session-frontmatter.pdr.md` ([audit])
- NEVER: rely on grep or raw text scanning for frontmatter-key compliance — textual search cannot model TypeScript syntax or the registry-definition exemption ([audit])
