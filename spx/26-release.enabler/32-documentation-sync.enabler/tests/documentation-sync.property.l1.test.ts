import { AGENT_PERMISSION_MODES, AGENT_TOOL_PERMISSION_BEHAVIOR } from "@/agent/agent-runner";
import { RELEASE_CONFIG_FIELDS, releaseConfigDescriptor } from "@/domains/release/config";
import { DOCUMENTATION_SYNC_AUDIT_APPROVED } from "@/domains/release/documentation-sync";
import { selectReleaseOwnershipContext } from "@/domains/release/product-context";
import { releaseVersionFromTag } from "@/domains/release/release-data";
import { RELEASE_PRODUCT_TRUTH_STANDARDS } from "@/domains/release/release-notes-standards";
import { isPathContained } from "@/lib/file-system/pathContainment";
import { RELEASE_TAG_PREFIX } from "@/lib/git/release";
import {
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryDocumentationAgentFileToolBoundaryScenario,
  arbitraryDocumentationVersionPreservationScenarios,
  arbitraryDuplicateDocumentationPathSet,
  arbitraryProtectedVersionRewriteScenario,
  arbitrarySparseDocumentationPathSet,
  documentationContentEntries,
} from "@testing/generators/release/documentation";
import {
  arbitraryReleaseContextScenario,
  arbitraryReleaseEndpointOwnershipScenario,
  arbitraryReleaseEndpointSourceScenario,
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
} from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  observeConfiguredDocumentationPathSet,
  observeDocumentationAgentFileToolBoundary,
  observeDocumentationContextTransport,
  observeDocumentationVersionPreservation,
  observeProtectedVersionRewrite,
} from "@testing/harnesses/release/documentation-sync";
import { observeReleaseEndpointSources } from "@testing/harnesses/release/product-context";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

it("preserves identical product truth and release inputs for both documentation agents", async () => {
  await assertProperty(
    fc.tuple(arbitraryConfiguredDocumentationSyncScenario(), arbitraryReleaseContextScenario()),
    async ([scenario, context]) => {
      const observation = await observeDocumentationContextTransport(
        scenario,
        context,
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      );
      for (const input of [observation.producerSource, observation.auditorSource]) {
        expect(input).toEqual({
          productContext: context.documents,
          releaseData: { ...scenario.releaseData, changedPaths: context.releaseData.changedPaths },
        });
      }
      for (const prompt of [observation.producerPrompt, observation.auditPrompt]) {
        expect(prompt).toContain(RELEASE_PRODUCT_TRUTH_STANDARDS);
      }
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
});

it("retains every distinct candidate and governing node across both release endpoints", async () => {
  await assertProperty(
    arbitraryReleaseEndpointOwnershipScenario(),
    (scenario) => {
      expect(selectReleaseOwnershipContext(scenario.changedPaths, scenario.endpointOwnership)).toEqual(
        { nodeIds: scenario.expectedNodeIds, unresolvedPaths: scenario.expectedUnresolvedPaths },
      );
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
});

it.each(Object.values(RELEASE_ENDPOINT_OWNERSHIP_CASE))(
  "resolves generated %s ownership topologies across in-memory release endpoints before invoking agents",
  async (kind) => {
    await assertProperty(
      arbitraryReleaseEndpointSourceScenario(kind),
      async (scenario) => {
        const observation = await observeReleaseEndpointSources(scenario);
        const contextPaths = observation.context.map(({ path }) => path);
        if (scenario.kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED) {
          expect(observation.error).toBeInstanceOf(Error);
          expect((observation.error as Error).message).toContain(scenario.changedSourcePath);
          expect(observation.producerInvocations).toBe(0);
          expect(observation.auditorInvocations).toBe(0);
        } else {
          expect(observation.error).toBeUndefined();
          expect(contextPaths).toEqual(expect.arrayContaining([...scenario.expectedContextPaths]));
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  },
);

describe("documentation sync path properties", () => {
  it("preserves every generated configured documentation path set", async () => {
    await assertProperty(
      arbitraryConfiguredDocumentationSyncScenario(),
      async (scenario) => {
        const observation = observeConfiguredDocumentationPathSet(scenario);
        expect(observation.actual).toEqual(scenario.paths);
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
        for (
          const observation of await observeDocumentationVersionPreservation(
            scenarios,
            async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
          )
        ) {
          const previousVersion = observation.scenario.releaseData.previousTag === null
            ? undefined
            : releaseVersionFromTag(observation.scenario.releaseData.previousTag);
          for (const document of observation.actual) {
            const originalContent = observation.scenario.original[document.path];
            expect(originalContent).toBeDefined();
            if (originalContent === undefined) continue;
            expect(document.content).toContain(observation.scenario.releaseData.version);
            for (
              const token of originalContent.split(/\s+/u).filter(Boolean).filter((candidate) =>
                previousVersion === undefined
                || (
                  candidate !== previousVersion
                  && candidate !== `${RELEASE_TAG_PREFIX}${previousVersion}`
                )
              )
            ) {
              expect(document.content).toContain(token);
            }
          }
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("rejects every generated protected semantic-version rewrite before promotion", async () => {
    await assertProperty(
      arbitraryProtectedVersionRewriteScenario(),
      async (testCase) => {
        const observation = await observeProtectedVersionRewrite(
          testCase,
          async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
        );
        expect(observation.error).toBeDefined();
        expect(observation.auditRequestCount).toBe(0);
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(testCase.scenario, testCase.scenario.original),
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("confines every generated agent file read, write, and edit to the staging workspace", async () => {
    await assertProperty(
      arbitraryDocumentationAgentFileToolBoundaryScenario(),
      async (scenario) => {
        const observation = await observeDocumentationAgentFileToolBoundary(
          scenario,
          async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
        );
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
