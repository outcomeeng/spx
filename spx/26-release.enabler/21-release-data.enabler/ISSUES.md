# Issues

## Prerelease and build-metadata version suffixes are misclassified

`parseSemver` in [release-data.ts](../../../src/domains/release/release-data.ts) splits on `.` and reads each component with `parseInt`, which silently truncates a prerelease or build-metadata suffix: `1.2.3-rc.1` yields patch `3` (from `parseInt("3-rc")`). A product working tree whose `package.json` carries a prerelease version passes through `classifyVersionDelta` without detection. The spec covers only advancing versions; equal versions are deferred to publish dispatch. Prerelease inputs are a third unhandled case.

**Resolution when addressed:** decide the prerelease contract (reject, or a distinct delta) alongside publish dispatch's tag-version precondition in [43-publish-dispatch.enabler](../43-publish-dispatch.enabler), declare it in [release-data.md](release-data.md), and add its test.

## Tag-anchor exclusion is verified only for lightweight tags

`closestReleaseTag` in [release-data.ts](../../../src/lib/git/release.ts) anchors on the prior tag by passing every tag at HEAD to `git describe --tags --exclude`. The multiple-tags-at-HEAD scenario test exercises this with lightweight tags (`git tag <name>`) and confirms the anchor falls on the prior tag. The tag type the publish workflow creates is decided by [43-publish-dispatch.enabler](../43-publish-dispatch.enabler) and is not yet implemented, so exclusion against annotated tags at HEAD is unverified.

**Resolution when addressed:** once publish dispatch declares whether it creates lightweight or annotated release tags, confirm `--exclude` suppresses that tag type, and add a scenario test with an annotated tag at HEAD if the distinction is relevant.
