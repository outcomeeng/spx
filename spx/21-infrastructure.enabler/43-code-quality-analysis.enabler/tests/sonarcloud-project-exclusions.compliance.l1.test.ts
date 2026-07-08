import { assertLefthookConfigDeclaresNoSonarCloudCommitBoundaryHook } from "@testing/harnesses/precommit/hook-install";
import { assertSonarCloudPropertiesDeclareNoProjectExclusions } from "@testing/harnesses/validation/sonarcloud-project-exclusions";
import { describe, expect, it } from "vitest";

describe("SonarCloud project exclusions", () => {
  it("keeps SonarCloud project-side exclusions out of the repository properties file", async () => {
    await expect(assertSonarCloudPropertiesDeclareNoProjectExclusions()).resolves.toBeUndefined();
  });

  it("keeps SonarCloud fixture-exclusion synchronization and analysis out of commit-boundary hooks", async () => {
    await expect(assertLefthookConfigDeclaresNoSonarCloudCommitBoundaryHook()).resolves.toBeUndefined();
  });
});
