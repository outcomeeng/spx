# Verification Path Scope

GOVERNS how product commands resolve caller-supplied product paths and how verification commands apply those paths as scope operands. A command declares the target classes it accepts; every unambiguous spelling of an accepted target resolves to one canonical identity, while unresolved, ambiguous, and outside-product operands fail without guessing. Verification commands accept those paths positionally and map them only to work owned by the invoked verification surface.

## Rationale

Callers know paths by several stable spellings: from their invocation directory, from the product root, or by an unambiguous suffix of a canonical target path. One shared resolution rule preserves that convenience without giving candidate sources precedence or expanding a command's accepted target classes. Positional verification operands keep the shared path vocabulary visible without duplicating it in surface-specific flags.

## Product properties

1. Absolute operands resolve as written; relative operands collect candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over the invoked command's accepted canonical target paths.
2. Candidate paths are normalized lexically, resolved through symbolic links, discarded when their resolved location lies outside the resolved product root, collapsed by canonical target identity, and accepted only when exactly one identity remains; ambiguity reports every canonical match.
3. A verification command accepts zero or more positional product path operands after options, expands them to work the surface owns, and preserves its configured unscoped behavior when operands are omitted.

## Verification

- ALWAYS: each path-taking command declares its accepted target classes, and suffix matching considers only canonical paths in those classes.
- ALWAYS: candidate sources have no precedence; several distinct canonical identities fail as ambiguous and zero identities fail as unresolved.
- NEVER: a path operand escaping the resolved product root through lexical traversal or symbolic-link resolution is accepted.
- ALWAYS: verification path operands resolve before surface-specific filters and select only work owned by the invoked surface.
- NEVER: introduce a verification path-scope flag such as `--files`, `--tests`, or `--nodes` when positional operands express the same product path scope.
