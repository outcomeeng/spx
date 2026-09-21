# Issues

## Equal package and previous-release versions have no declared delta

`classifyVersionDelta` in [release-data.ts](../../../src/domains/release/release-data.ts) classifies the delta between the previous release tag's version and the package version as the most significant differing component, falling through to `PATCH` when the two encode the same version. Re-releasing the same version is an error, not a patch, so this fall-through has no declared product meaning.

Publish dispatch governs the release tag and package-version relationship in [43-publish-dispatch.enabler](../43-publish-dispatch.enabler). Until that contract is declared, callers cannot rely on the delta for equal versions, and the property evidence in [release-data.property.l1.test.ts](tests/release-data.property.l1.test.ts) covers only versions that advance beyond the previous tag.

**Resolution when addressed:** once publish dispatch declares its tag-version precondition, specify whether an equal version produces a distinct no-delta value or rejects the release in [release-data.md](release-data.md), then extend the property evidence across that case.

## Prerelease and build-metadata version suffixes are misclassified

`parseSemver` in [release-data.ts](../../../src/domains/release/release-data.ts) splits on `.` and reads each component with `parseInt`, which silently truncates a prerelease or build-metadata suffix: `1.2.3-rc.1` yields patch `3` (from `parseInt("3-rc")`). A product working tree whose `package.json` carries a prerelease version passes through `classifyVersionDelta` without detection. The spec covers only advancing versions; equal versions are deferred to publish dispatch. Prerelease inputs are a third unhandled case.

**Resolution when addressed:** decide the prerelease contract (reject, or a distinct delta) alongside publish dispatch's tag-version precondition in [43-publish-dispatch.enabler](../43-publish-dispatch.enabler), declare it in [release-data.md](release-data.md), and add its test.

## Tag-anchor exclusion is verified only for lightweight tags

`closestReleaseTag` in [release-data.ts](../../../src/lib/git/release.ts) anchors on the prior tag by passing every tag at HEAD to `git describe --tags --exclude`. The multiple-tags-at-HEAD scenario test exercises this with lightweight tags (`git tag <name>`) and confirms the anchor falls on the prior tag. The tag type the publish workflow creates is decided by [43-publish-dispatch.enabler](../43-publish-dispatch.enabler) and is not yet implemented, so exclusion against annotated tags at HEAD is unverified.

**Resolution when addressed:** once publish dispatch declares whether it creates lightweight or annotated release tags, confirm `--exclude` suppresses that tag type, and add a scenario test with an annotated tag at HEAD if the distinction is relevant.

## The determinism property fails on some generated repository states

`tests/release-data.property.l1.test.ts` — "computeReleaseData — release data is a
deterministic function of repository state > produces identical release data for
identical repository state" — failed once during a full-suite run and passed on the
next run of the same node with a fresh seed, so the failure follows the drawn
repository state rather than the code under test.

**Impact:** the determinism gate passes or fails depending on the seed, so a real
non-determinism in release-data computation is indistinguishable from a green run
until the failing state is captured.

**Resolution:** capture the failing seed from a reproducing run and replay it with
`SPX_PROPERTY_SEED=<seed> tsx src/cli.ts test spx/26-release.enabler/21-release-data.enabler`,
read the shrunk counterexample, and decide whether the non-determinism is in the
computation or in the generator's repository-state domain. Keep the counterexample
as a scenario alongside the property.
