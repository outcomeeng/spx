# Release Data Computation

Release data is assembled by a pure function in `src/domains/release/` that composes generic git-plumbing queries — ref resolution, release-tag listing, commit listing between two refs, and commit-history touched-path listing over the same ref range — over a caller-supplied product directory and package version, returning a typed `ReleaseData` record carrying that package version, the resolved release-endpoint commit, the previous release tag, the commits in that range, the version delta, and the paths those commits touch. The composition function wraps the caller-supplied `GitDependencies` runner in the release-data local-operation boundary before any query receives it; the git-plumbing queries live in `src/lib/git/`, while previous-tag resolution and version-delta classification live in the composition function.

## Rationale

A release's deterministic core must verify without a model or network. Git plumbing belongs in `src/lib/git/` behind an injectable `GitDependencies` runner that sanitizes the git environment; the release-data composition narrows that runner to the exact local operations its queries require, so a query cannot expand the computation into another executable or git capability. Release-tag, commit-range, and commit-history touched-path queries reuse the guarded runner so every release git query shares one home, while `src/domains/release/` stays free of execa and process concerns. The queries stay generic — a query lists tags, commits, or paths touched by commits between two refs and reports what git reports — so they carry no notion of which tag is "previous" or whether a delta is major, minor, or patch. That selection and classification is release logic, so it belongs to the composition function alone; a query that embedded it could not be reused for any other ref pair and would entangle git access with release policy.

Commit-history touched-path discovery remains separate from the committed-range net-diff operations governed by [`spx/18-state.enabler/43-git-utility.enabler/21-git-utility-architecture.adr.md`](../../18-state.enabler/43-git-utility.enabler/21-git-utility-architecture.adr.md). A path changed and restored within the release range still belongs to the release's commit history even though it is absent from the range's net diff.

Finite git-plumbing scenarios exercise the injected runner against isolated real repositories. Combinatorial properties over release-data composition use a controlled `GitDependencies` implementation that represents generated repository states in memory, so property run counts do not multiply process and filesystem operations.

The package version is the product's, not the harness's. Release applies to any product spx runs against, so the version reaches computation as a caller-supplied input read from the product working tree's `package.json` — never the spx executable's own compiled-in version. Supplying it as an input keeps the composition function a pure function of its arguments and the injected runner, so identical repository state yields identical release data.

`ReleaseData` is one typed record because release notes, documentation sync, and publish dispatch all describe the same release; a single contract is what lets them agree on its version, exact range endpoints, commits, version delta, and changed paths. The package version travels in the record so the children read one version — the notes heading, the documentation version references, and the publish precondition all draw from the same field rather than re-resolving it. The resolved release-endpoint commit travels in the same record so later context selection reads the same repository state that produced the commits and changed paths even when a symbolic ref advances.

The dependency-injected git runner, the sanitized git environment, the prohibition on mocking, the no-network/no-model boundary, and the three-layer command structure are governed by `spx/26-release.enabler/18-release-architecture.adr.md` and `spx/14-cli-composition.adr.md`; this decision refines them with the placement, version source, and contract specific to release data.

## Invariants

- Release data is a pure function of the product repository at a resolved ref: identical repository state, product directory, and package version yield an identical `ReleaseData` record carrying that exact endpoint.
- Every git-plumbing query used by release-data computation receives the release-data local-operation boundary rather than the caller's unrestricted runner.
- A release git-plumbing query reports only the tags, commits, or commit-history touched paths that git reports for the refs it is given; it holds no release-tag selection or version-delta logic.

## Verification

### Audit

- ALWAYS: release git-plumbing queries — release-tag listing, commit listing between two refs, and commit-history touched-path listing over the same ref range — live in `src/lib/git/` and reuse the `GitDependencies` runner, so they verify in isolation against real temp git fixtures with no ambient git state ([audit])
- ALWAYS: release-data composition is a pure function in `src/domains/release/` that takes the product directory, the package version, and an injected `GitDependencies` runner as inputs and returns a `ReleaseData` record ([audit])
- ALWAYS: release-data composition wraps the injected `GitDependencies` runner in its source-owned local-operation boundary before passing it to ref resolution or any release git-plumbing query ([audit])
- ALWAYS: the package version reaches release-data computation as a caller-supplied input resolved from the product working tree's `package.json`, never the spx executable's own compiled-in version ([audit])
- ALWAYS: `ReleaseData` is the single typed contract carrying the package version, the resolved release-endpoint commit, the previous release tag, the commits in that range, the version delta, and the changed paths that downstream release children read ([audit])
- NEVER: a release git-plumbing query embeds release-tag selection or version-delta classification — previous-tag resolution and delta classification belong to the composition function ([audit])
- NEVER: release changed-path discovery substitutes a committed-range net diff for the paths touched by the release commit history ([audit])
- ALWAYS: finite git-plumbing scenarios exercise the injected runner against isolated real repositories, while combinatorial properties over release-data composition use a controlled `GitDependencies` implementation and perform no process or filesystem operation inside a generated case ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem mocking replaces the injected `GitDependencies` boundary in release-data evidence ([audit])
