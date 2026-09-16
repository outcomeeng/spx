import { isAbsolute } from "node:path";

import { isPathContained } from "@/lib/file-system/pathContainment";
import { arbitraryConfiguredChangelogPath, oracleResolvedChangelogPath } from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { sampleReleaseNotesCompositionFixture } from "@testing/generators/release/release-notes";
import { observeIndependentVersionSection } from "@testing/harnesses/release/keep-a-changelog-oracle";
import {
  observeCanonicalReleaseNotesCommand,
  observeComposedReleaseNotes,
  observeConfiguredReleaseNotesPath,
  observeDefaultReleaseNotesPath,
  observeReleaseNotesCommand,
} from "@testing/harnesses/release/release-notes-scenarios";
import { describe, expect, it } from "vitest";

describe("resolveReleaseNotesPath resolves the changelog within the product working tree", () => {
  it("resolves the default changelog within the working tree when no path is configured", async () => {
    await expect(observeDefaultReleaseNotesPath()).resolves.toSatisfy(
      (observation) =>
        isAbsolute(observation.resolvedPath)
        && isPathContained(observation.workingDirectory, observation.resolvedPath)
        && observation.resolvedPath
          === oracleResolvedChangelogPath(observation.workingDirectory, observation.configuredPath),
    );
  });

  it("resolves a configured changelog path within the working tree", async () => {
    await expect(
      observeConfiguredReleaseNotesPath(sampleReleaseTestValue(arbitraryConfiguredChangelogPath())),
    ).resolves.toSatisfy(
      (observation) =>
        isPathContained(observation.workingDirectory, observation.resolvedPath)
        && observation.resolvedPath
          === oracleResolvedChangelogPath(observation.workingDirectory, observation.configuredPath),
    );
  });
});

describe("composeReleaseNotes writes the changelog at the resolved path", () => {
  it("writes the changelog carrying a section for the release version", async () => {
    const fixture = sampleReleaseNotesCompositionFixture();
    await expect(observeComposedReleaseNotes(fixture)).resolves.toSatisfy(
      (observation) =>
        observation.content === fixture.conformant
        && observeIndependentVersionSection(observation.content, fixture.releaseData.version) !== undefined,
    );
  });
});

describe("releaseNotesCommand wires release-note composition into the release workflow", () => {
  it("writes the changelog through the production command handler", async () => {
    const fixture = sampleReleaseNotesCompositionFixture();
    await expect(observeReleaseNotesCommand(fixture)).resolves.toSatisfy(
      (observation) =>
        observation.output === observation.resolvedPath
        && observation.content === fixture.conformant
        && observeIndependentVersionSection(observation.content, fixture.releaseData.version) !== undefined,
    );
  });

  it("reports the promoted canonical changelog path", async () => {
    const fixture = sampleReleaseNotesCompositionFixture();
    await expect(
      observeCanonicalReleaseNotesCommand(
        fixture,
        sampleReleaseTestValue(RELEASE_TEST_GENERATOR.distinctPathSegmentTriple()),
      ),
    ).resolves.toSatisfy(
      (observation) =>
        observation.output === observation.canonicalPath
        && observation.canonicalPath !== observation.lexicalPath
        && observation.content === fixture.conformant
        && observeIndependentVersionSection(observation.content, fixture.releaseData.version) !== undefined,
    );
  });
});
