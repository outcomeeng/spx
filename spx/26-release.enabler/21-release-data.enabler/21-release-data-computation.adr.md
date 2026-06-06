# Release Data Computation

Release data is assembled by a pure function in `src/domains/release/` that composes generic git-plumbing queries — release-tag listing, commit listing between two refs, and changed-path listing between two refs — over a caller-supplied product directory and package version, returning a typed `ReleaseData` record carrying the commits since the previous release tag, the version delta, and the changed paths. The git-plumbing queries live in `src/git/` and reuse the injectable `GitDependencies` runner; previous-tag resolution and version-delta classification live in the composition function, not in the queries.

## Rationale

A release's deterministic core must verify without a model or network. Git plumbing belongs in `src/git/` behind an injectable `GitDependencies` runner that sanitizes the git environment; release-tag, commit-range, and changed-path queries reuse that runner so every git query shares one home, while `src/domains/release/` stays free of execa and process concerns. The queries stay generic — a query lists tags or commits between two refs and reports what git reports — so they carry no notion of which tag is "previous" or whether a delta is major, minor, or patch. That selection and classification is release logic, so it belongs to the composition function alone; a query that embedded it could not be reused for any other ref pair and would entangle git access with release policy.

The package version is the product's, not the harness's. Release applies to any product spx runs against, so the version reaches computation as a caller-supplied input read from the product working tree's `package.json` — never the spx executable's own compiled-in version. Supplying it as an input keeps the composition function a pure function of its arguments and the injected runner, so identical repository state yields identical release data.

`ReleaseData` is one typed record because release notes, documentation sync, and publish dispatch all describe the same release; a single contract is what lets them agree on its commits, version delta, and changed paths.

The dependency-injected git runner, the sanitized git environment, the prohibition on mocking, the no-network/no-model boundary, and the three-layer command structure are governed by [18-release-architecture.adr.md](../18-release-architecture.adr.md) and [spx/14-cli-composition.adr.md](../../14-cli-composition.adr.md); this decision refines them with the placement, version source, and contract specific to release data.

## Invariants

- Release data is a pure function of the product working tree at a ref: identical repository state, product directory, and package version yield an identical `ReleaseData` record.
- A git-plumbing query reports only what git reports for the refs it is given; it holds no release-tag selection or version-delta logic.

## Verification

### Audit

- ALWAYS: release git-plumbing queries — release-tag listing, commit listing between two refs, changed-path listing between two refs — live in `src/git/` and reuse the `GitDependencies` runner, so they verify in isolation against real temp git fixtures with no ambient git state ([audit])
- ALWAYS: release-data composition is a pure function in `src/domains/release/` that takes the product directory, the package version, and an injected `GitDependencies` runner as inputs and returns a `ReleaseData` record ([audit])
- ALWAYS: the package version reaches release-data computation as a caller-supplied input resolved from the product working tree's `package.json`, never the spx executable's own compiled-in version ([audit])
- ALWAYS: `ReleaseData` is the single typed contract carrying the commits since the previous release tag, the version delta, and the changed paths that downstream release children read ([audit])
- NEVER: a release git-plumbing query embeds release-tag selection or version-delta classification — previous-tag resolution and delta classification belong to the composition function ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem mocking stands in for a real temp git fixture when verifying release git queries or release-data composition — the `GitDependencies` runner is injected and exercised against real repositories ([audit])
