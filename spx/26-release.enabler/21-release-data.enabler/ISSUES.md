# Issues

## Prerelease and build-metadata version suffixes are misclassified

`parseSemver` in [release-data.ts](../../../src/domains/release/release-data.ts) splits on `.` and reads each component with `parseInt`, which silently truncates a prerelease or build-metadata suffix: `1.2.3-rc.1` yields patch `3` (from `parseInt("3-rc")`). A product working tree whose `package.json` carries a prerelease version passes through `classifyVersionDelta` without detection. The spec covers only advancing versions; equal versions are deferred to publish dispatch. Prerelease inputs are a third unhandled case.

**Resolution when addressed:** decide the prerelease contract (reject, or a distinct delta) alongside publish dispatch's tag-version precondition in [43-publish-dispatch.enabler](../43-publish-dispatch.enabler), declare it in [release-data.md](release-data.md), and add its test.

## Tag-anchor exclusion is verified only for lightweight tags

`closestReleaseTag` in [release-data.ts](../../../src/lib/git/release.ts) anchors on the prior tag by passing every tag at HEAD to `git describe --tags --exclude`. The multiple-tags-at-HEAD scenario test exercises this with lightweight tags (`git tag <name>`) and confirms the anchor falls on the prior tag. The tag type the publish workflow creates is decided by [43-publish-dispatch.enabler](../43-publish-dispatch.enabler) and is not yet implemented, so exclusion against annotated tags at HEAD is unverified.

**Resolution when addressed:** once publish dispatch declares whether it creates lightweight or annotated release tags, confirm `--exclude` suppresses that tag type, and add a scenario test with an annotated tag at HEAD if the distinction is relevant.

## The determinism property fails intermittently under a full parallel run

`produces identical release data for identical repository state` in [release-data.property.l1.test.ts](tests/release-data.property.l1.test.ts) failed once during a 348-file `spx test --changed` run and passed both in isolation and on an immediate re-run of the same scope, on the same tree. The property builds real git repositories in temp directories, so a full parallel run puts many concurrent `git` invocations and temp-directory lifecycles against the same machine. No counterexample was captured, and the failing assertion was not recorded.

**Impact:** a CI run can fail on a node whose behavior did not change, and the flake looks like a determinism defect in release data.

**Resolution when addressed:** capture the failing counterexample and the seed on the next occurrence, then decide whether the fixture's git invocations need serialization or a per-case working directory the parallel runner cannot share.
