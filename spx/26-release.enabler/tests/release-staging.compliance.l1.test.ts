/**
 * Release staging compliance: a completed release-notes composition and a completed documentation
 * sync each stage their working files in a directory inside the run root the temp-directory primitive
 * exports, and neither leaves that directory behind once the release has finished.
 */

import { describe, expect, it } from "vitest";

import { isPathContained } from "@/lib/file-system/pathContainment";
import { arbitraryDefaultDocumentationSyncScenario } from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { sampleReleaseNotesCompositionFixture } from "@testing/generators/release/release-notes";
import { observeDocumentationSyncStaging } from "@testing/harnesses/release/documentation-sync";
import { observeReleaseNotesStaging } from "@testing/harnesses/release/release-staging";

describe("a completed release-notes composition", () => {
  it("stages in a directory inside the run root and leaves no staging directory behind", async () => {
    const observation = await observeReleaseNotesStaging(sampleReleaseNotesCompositionFixture());

    expect(observation.runRoot).toBeDefined();
    expect(observation.stages.length).toBeGreaterThan(0);
    for (const stage of observation.stages) {
      expect(stage.existedWhileStaged).toBe(true);
      expect(isPathContained(observation.runRoot ?? "", stage.workingDirectory)).toBe(true);
      expect(stage.existsAfterRelease).toBe(false);
    }
  });
});

describe("a completed documentation sync", () => {
  it("stages in a directory inside the run root and leaves no staging directory behind", async () => {
    const observation = await observeDocumentationSyncStaging(
      sampleReleaseTestValue(arbitraryDefaultDocumentationSyncScenario()),
    );

    expect(observation.runRoot).toBeDefined();
    expect(observation.stages.length).toBeGreaterThan(0);
    for (const stage of observation.stages) {
      expect(stage.existedWhileStaged).toBe(true);
      expect(isPathContained(observation.runRoot ?? "", stage.workingDirectory)).toBe(true);
      expect(stage.existsAfterRelease).toBe(false);
    }
  });
});
