# Plan

## Specify the version delta for an unchanged version

`classifyVersionDelta` in [release-data.ts](../../../src/domains/release/release-data.ts) classifies the delta between the previous release tag's version and the package version as the most significant differing component, falling through to `PATCH` when the two encode the same version. Re-releasing the same version is an error, not a patch, so this fall-through is a placeholder rather than declared product truth.

What an unchanged version means for a release is governed by publish dispatch, which verifies the release tag equals the package version prefixed with `v` (`spx/26-release.enabler/43-publish-dispatch.enabler`). The delta's contract for equal versions is decided there, not in the provider.

**Skills:** `/spec-tree:authoring`, `/spec-tree:applying`, `/typescript:testing-typescript`.

**Deferred until:** publish dispatch declares its tag-version precondition. Then specify `classifyVersionDelta`'s equal-version result — a distinct no-delta value or a rejected release — in [release-data.md](release-data.md), and add its test. Until then, callers must not rely on the delta for equal versions. The mapping test ([release-data.mapping.l1.test.ts](tests/release-data.mapping.l1.test.ts)) accordingly exercises only versions that advance beyond the previous tag, matching the mapping assertion's stated scope.
