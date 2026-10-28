/**
 * Release staging compliance: release-notes composition and documentation sync each stage their working
 * files in a directory inside the run root the temp-directory primitive exports, and leave no staging
 * directory behind however the release ends: completed, failed in the agent run, or rejected by the
 * faithfulness audit.
 */

import { describe, expect, it } from "vitest";

import { isPathContained } from "@/lib/file-system/pathContainment";
import { arbitraryDefaultDocumentationSyncScenario } from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { sampleReleaseNotesCompositionFixture } from "@testing/generators/release/release-notes";
import { observeDocumentationSyncStaging } from "@testing/harnesses/release/documentation-sync";
import {
  observeReleaseNotesStaging,
  RELEASE_STAGING_OUTCOME,
  RELEASE_STAGING_SETTLEMENT,
  type ReleaseStagingObservation,
  type ReleaseStagingOutcome,
} from "@testing/harnesses/release/release-staging";

function expectStagedInsideRunRootAndRemoved(
  observation: ReleaseStagingObservation,
  outcome: ReleaseStagingOutcome,
): void {
  expect(observation.settled).toBe(
    outcome === RELEASE_STAGING_OUTCOME.COMPLETED
      ? RELEASE_STAGING_SETTLEMENT.RESOLVED
      : RELEASE_STAGING_SETTLEMENT.REJECTED,
  );
  expect(observation.runRoot).toBeDefined();
  expect(observation.stages.length).toBeGreaterThan(0);
  for (const stage of observation.stages) {
    expect(stage.existedWhileStaged).toBe(true);
    expect(isPathContained(observation.runRoot ?? "", stage.workingDirectory)).toBe(true);
    expect(stage.existsAfterRelease).toBe(false);
  }
  expect(observation.strayEntries).toEqual([]);
}

describe.each(Object.values(RELEASE_STAGING_OUTCOME))("release-notes composition that ends as %s", (outcome) => {
  it("stages in a directory inside the run root and leaves no staging directory behind", async () => {
    const observation = await observeReleaseNotesStaging(sampleReleaseNotesCompositionFixture(), outcome);

    expectStagedInsideRunRootAndRemoved(observation, outcome);
  });
});

describe.each(Object.values(RELEASE_STAGING_OUTCOME))("documentation sync that ends as %s", (outcome) => {
  it("stages in a directory inside the run root and leaves no staging directory behind", async () => {
    const observation = await observeDocumentationSyncStaging(
      sampleReleaseTestValue(arbitraryDefaultDocumentationSyncScenario()),
      outcome,
    );

    expectStagedInsideRunRootAndRemoved(observation, outcome);
  });
});
