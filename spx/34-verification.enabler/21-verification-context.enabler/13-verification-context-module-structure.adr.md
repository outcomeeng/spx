# Verification Context Module Structure

The verification-context command follows the three-layer CLI composition of `spx/14-cli-composition.adr.md`: pure context construction, digesting, and path construction live under `src/domains/verification-context/`; process-agnostic orchestration and persistence live under `src/commands/verification-context/`; and the Commander descriptor lives at `src/interfaces/cli/verification-context.ts`. The domain owns the canonical payload and digest rules with no filesystem or process access, the command layer resolves product root and branch identity and persists through shared state-store dependencies, and the CLI descriptor parses caller-supplied subject, predicate, and workflow options without launching a verifier.

## Rationale

Verification context is a pre-execution artifact, so canonicalization and digesting must be stable and independent of the terminal run journal. Keeping those rules pure makes determinism testable without a repository or filesystem, while the command layer owns the state-store write and git-derived branch identity. The context surface is type-agnostic: spx records caller-supplied predicate and workflow strings, while the verifier selection remains outside spx.

Rejected: storing context inside a journal event only, because CI and external launchers need the context before a run exists; putting context creation in the journal command, because context is input while the journal is execution evidence; and per-predicate commands, because that carries verification-type vocabulary into spx and implies spx owns verifier orchestration.

## Invariants

- `src/domains/verification-context/` accesses no filesystem, git process, process globals, or command modules.
- The canonical digest is a pure function of the context payload.
- The persistence path is a pure function of product root, branch slug, and digest.
- Predicate and workflow remain caller-supplied strings; no module names a verification kind.

## Verification

### Audit

- ALWAYS: canonical payload construction, digesting, and context-path composition live in `src/domains/verification-context/` as pure functions with no filesystem, git process, process globals, or command-layer imports ([audit])
- ALWAYS: git-root and branch identity resolution plus filesystem persistence live in `src/commands/verification-context/`, with filesystem and git dependencies injected for verification ([audit])
- ALWAYS: `src/interfaces/cli/verification-context.ts` only parses options and reports command results; it does not launch, configure, or select a verifier ([audit])
- NEVER: a module under `src/domains/verification-context/`, `src/commands/verification-context/`, or `src/interfaces/cli/verification-context.ts` carries a verification-type identifier (`audit`, `review`) as command vocabulary or branching logic ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the filesystem, git environment, or command behavior; tests inject controlled dependencies and exercise real code paths ([audit])
