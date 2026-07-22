import {
  DOCUMENTATION_SYNC_REPLACE_PREVIOUS_VERSION_INSTRUCTION,
  DOCUMENTATION_SYNC_VERSIONLESS_INSTRUCTION,
  type DocumentationSyncPromptInput,
} from "@/domains/release/documentation-sync";
import { documentationContentEntries } from "@testing/generators/release/documentation";
import {
  AGENT_PERMISSION_MODES,
  DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION,
  observeConfiguredDocumentationSync,
  observeDefaultDocumentationSync,
  observeFirstReleaseDocumentationSync,
  observeVersionlessSubsequentReleaseDocumentationSync,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync scenarios", () => {
  it("updates the default product README to the released version", async () => {
    await expect(observeDefaultDocumentationSync()).resolves.toSatisfy(
      ({ actual, producerInput, scenario }) => {
        expect(producerInput.releaseData).toEqual(scenario.releaseData);
        expect(actual).toEqual(documentationContentEntries(scenario, scenario.updated));
        return true;
      },
    );
  });

  it("updates every configured documentation path to the released version", async () => {
    await expect(observeConfiguredDocumentationSync()).resolves.toSatisfy(
      (observation) => {
        const { actual, producerInput, scenario } = observation;
        expect(producerInput.releaseData).toEqual(scenario.releaseData);
        expect(
          producerInput.documents.map(
            ({ sourcePath }: DocumentationSyncPromptInput["documents"][number]) => sourcePath,
          ),
        ).toEqual(scenario.paths);
        expect(observation.producerInstruction).toContain(DOCUMENTATION_SYNC_REPLACE_PREVIOUS_VERSION_INSTRUCTION);
        expect(actual).toEqual(documentationContentEntries(scenario, scenario.updated));
        return true;
      },
    );
  });

  it("adds the released version to first-release documentation", async () => {
    await expect(observeFirstReleaseDocumentationSync()).resolves.toSatisfy(
      ({ actual, encodedVersion, producerInput, producerInstruction, scenario }) => {
        expect(producerInput.releaseData).toEqual(scenario.releaseData);
        expect(producerInstruction).toContain(encodedVersion.slice(1, -1));
        for (const document of actual) {
          const originalContent = scenario.original[document.path];
          expect(originalContent).toBeDefined();
          if (originalContent === undefined) continue;
          expect(document.content).toContain(scenario.releaseData.version);
          expect(document.content).toContain(originalContent.trim());
        }
        return true;
      },
    );
  });

  it("adds the released version when subsequent-release documentation has no previous version reference", async () => {
    await expect(observeVersionlessSubsequentReleaseDocumentationSync()).resolves.toSatisfy(
      (observation) => {
        expect(observation.producerInput.releaseData).toEqual(observation.scenario.releaseData);
        expect(observation.producerInstruction).toContain(DOCUMENTATION_SYNC_VERSIONLESS_INSTRUCTION);
        expect(observation.producerInstruction).toContain(observation.encodedVersion.slice(1, -1));
        expect(observation.producerInstruction).not.toContain(observation.encodedVersion);
        expect(observation.permissionMode).toBe(AGENT_PERMISSION_MODES.DONT_ASK);
        expect(observation.auditRequestCount).toBe(1);
        expect(observation.auditInstruction).toContain(DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION);
        for (const document of observation.actual) {
          const originalContent = observation.scenario.original[document.path];
          expect(originalContent).toBeDefined();
          if (originalContent === undefined) continue;
          expect(document.content).toContain(observation.scenario.releaseData.version);
          expect(document.content).toContain(originalContent.trim());
        }
        return true;
      },
    );
  });
});
