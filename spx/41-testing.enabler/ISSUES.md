# Issues: Testing

Coordination notes for the `spx test` enabler. These concern the not-yet-built dispatch and registry; the per-language runner descriptors they consume are complete.

## FOLLOW-UP: the central testing registry is not yet created

`spx/19-language-registration.adr.md` requires a central registry that imports each language's testing descriptor via an explicit import statement, and requires orchestration to reach languages only through that registry. The registry module `src/testing/registry.ts` does not exist yet: `pythonTestingLanguage` (`src/testing/languages/python.ts`) and `typescriptTestingLanguage` (`src/testing/languages/typescript.ts`) are each exported but imported by their own tests only. Each runner node's ADR scopes the registry as this parent enabler's concern, so it is out of scope for the individual language-node changes.

**Resolution:** when the `spx test` command in `spx/41-testing.enabler/testing.md` is built, create `src/testing/registry.ts` importing `pythonTestingLanguage` and `typescriptTestingLanguage` via explicit import statements and exposing their enumeration, satisfying the language-registration invariant; the dispatch then iterates the registry rather than naming any language.

**Evidence:** `spx/19-language-registration.adr.md` (the registry MUST and the "no language named in orchestration" invariant); the two language nodes `spx/41-testing.enabler/21-python-testing.enabler` and `spx/41-testing.enabler/21-typescript-testing.enabler` both ship descriptors with no registry consuming them.
