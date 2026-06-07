# Known Issues

## classifyVersionDelta is undefined for equal versions

`classifyVersionDelta` in [release-data.ts](../../../src/domains/release/release-data.ts) compares the previous release tag's version with the package version and returns the most significant differing component. When the two encode the same semver it falls through to `PATCH`, which misrepresents a no-op: publishing the same version twice is an error condition, not a patch release.

The current spec assertions exercise only real bumps (the mapping assertion in [release-data.md](release-data.md)), so no test covers the equal-version case and the contract for it is unspecified.

**Skills:** `/spec-tree:authoring`, `/spec-tree:applying`, `/typescript:testing-typescript`.

**Resolution:** When publish dispatch specifies its tag-equals-`v`-prefixed-version precondition (`spx/26-release.enabler/43-publish-dispatch.enabler`), decide `classifyVersionDelta`'s behavior for equal inputs — surface a distinct no-delta result or reject — then add the governing spec assertion and its test. Until then, callers must not rely on the delta for equal versions.
