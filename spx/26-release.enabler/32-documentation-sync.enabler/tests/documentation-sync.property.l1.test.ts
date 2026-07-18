import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  AGENT_PERMISSION_MODES,
  AGENT_TOOL_PERMISSION_BEHAVIOR,
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryDocumentationAgentFileToolBoundaryScenario,
  arbitraryDocumentationVersionPreservationScenarios,
  arbitraryDuplicateDocumentationPathSet,
  arbitrarySparseDocumentationPathSet,
  arbitraryUnrelatedVersionRewriteScenario,
  isPathContained,
  observeConfiguredDocumentationPathSet,
  observeDocumentationAgentFileToolBoundary,
  observeDocumentationVersionPreservation,
  observeUnrelatedVersionRewrite,
  RELEASE_CONFIG_FIELDS,
  releaseConfigDescriptor,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync path properties", () => {
  it("preserves every generated configured documentation path set", async () => {
    await assertProperty(
      arbitraryConfiguredDocumentationSyncScenario(),
      async (scenario) => {
        const observation = await observeConfiguredDocumentationPathSet(scenario);
        expect(observation.actual).toEqual(observation.expected);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("rejects every generated duplicate-bearing configured documentation path set", () => {
    assertProperty(
      arbitraryDuplicateDocumentationPathSet(),
      (paths) => {
        expect(
          releaseConfigDescriptor.validate({
            [RELEASE_CONFIG_FIELDS.DOCUMENTATION]: {
              [RELEASE_CONFIG_FIELDS.PATHS]: paths,
            },
          }).ok,
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("rejects every generated sparse configured documentation path set", () => {
    assertProperty(
      arbitrarySparseDocumentationPathSet(),
      (paths) => {
        expect(
          releaseConfigDescriptor.validate({
            [RELEASE_CONFIG_FIELDS.DOCUMENTATION]: {
              [RELEASE_CONFIG_FIELDS.PATHS]: paths,
            },
          }).ok,
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("preserves every generated unrelated semantic version across release histories", async () => {
    await assertProperty(
      arbitraryDocumentationVersionPreservationScenarios(),
      async (scenarios) => {
        for (const observation of await observeDocumentationVersionPreservation(scenarios)) {
          expect(observation.actual).toEqual(observation.expected);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("rejects every generated unrelated semantic-version rewrite before promotion", async () => {
    await assertProperty(
      arbitraryUnrelatedVersionRewriteScenario(),
      async (testCase) => {
        const observation = await observeUnrelatedVersionRewrite(testCase);
        expect(observation.error).toBeDefined();
        expect(observation.actualAuditDocuments).toEqual(observation.expectedAuditDocuments);
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(observation.expected);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("confines every generated agent file read, write, and edit to the staging workspace", async () => {
    await assertProperty(
      arbitraryDocumentationAgentFileToolBoundaryScenario(),
      async (scenario) => {
        const observation = await observeDocumentationAgentFileToolBoundary(scenario);
        expect(
          observation.promptPaths.every((path) => isPathContained(observation.workingDirectory, path)),
        ).toBe(true);
        expect(observation.requestTools).toContain(observation.tool);
        expect(observation.requestAllowedTools).toContain(observation.tool);
        expect(observation.optionPermissionMode).toBe(AGENT_PERMISSION_MODES.DONT_ASK);
        expect(observation.optionAllowedTools).toContain(observation.tool);
        expect(observation.containedHookResult).toMatchObject({
          hookSpecificOutput: { permissionDecision: AGENT_TOOL_PERMISSION_BEHAVIOR.ALLOW },
        });
        for (const result of observation.escapedHookResults) {
          expect(result).toMatchObject({
            hookSpecificOutput: { permissionDecision: AGENT_TOOL_PERMISSION_BEHAVIOR.DENY },
          });
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
