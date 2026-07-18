import { isAbsolute } from "node:path";

import { RELEASE_NOTES_OUTPUT_PREFIX } from "@/commands/release/release-notes";
import { changelogVersionHeading } from "@/domains/release/release-notes";
import { isPathContained } from "@/lib/file-system/pathContainment";
import { oracleResolvedChangelogPath } from "@testing/generators/release/changelog";
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
    await expect(observeConfiguredReleaseNotesPath()).resolves.toSatisfy(
      (observation) =>
        isPathContained(observation.workingDirectory, observation.resolvedPath)
        && observation.resolvedPath
          === oracleResolvedChangelogPath(observation.workingDirectory, observation.configuredPath),
    );
  });
});

describe("composeReleaseNotes writes the changelog at the resolved path", () => {
  it("writes the changelog carrying a section for the release version", async () => {
    await expect(observeComposedReleaseNotes()).resolves.toSatisfy(
      (observation) => observation.content.includes(changelogVersionHeading(observation.version)),
    );
  });
});

describe("releaseNotesCommand wires release-note composition into the release workflow", () => {
  it("writes the changelog through the production command handler", async () => {
    await expect(observeReleaseNotesCommand()).resolves.toSatisfy(
      (observation) =>
        observation.output === `${RELEASE_NOTES_OUTPUT_PREFIX}: ${observation.resolvedPath}`
        && observation.content.includes(changelogVersionHeading(observation.version)),
    );
  });

  it("reports the promoted canonical changelog path", async () => {
    await expect(observeCanonicalReleaseNotesCommand()).resolves.toSatisfy(
      (observation) =>
        observation.output === `${RELEASE_NOTES_OUTPUT_PREFIX}: ${observation.canonicalPath}`
        && observation.canonicalPath !== observation.lexicalPath
        && observation.content.includes(changelogVersionHeading(observation.version)),
    );
  });
});
