import { join } from "node:path";

import {
  arbitraryDocumentationPathAliasCases,
  arbitraryNestedDocumentationSyncScenario,
  documentationPathMappingCases,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import {
  DOCUMENTATION_PATH_SEMANTICS,
  observeDocumentationPathAliases,
  observeDocumentationPathMappings,
  observeDocumentationPathSemantics,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync path mapping", () => {
  it.each(documentationPathMappingCases())("maps documentation path configuration %#", async (mappingCase) => {
    await expect(observeDocumentationPathMappings([mappingCase])).resolves.toSatisfy(
      (observations) => {
        for (const observation of observations) {
          expect(observation.actual).toEqual(observation.mappingCase.expected);
        }
        return true;
      },
    );
  });

  it.each(DOCUMENTATION_PATH_SEMANTICS)("resolves nested slash-separated paths under $label semantics", (semantics) => {
    expect(
      observeDocumentationPathSemantics(
        sampleReleaseTestValue(arbitraryNestedDocumentationSyncScenario()),
        [semantics],
      ),
    ).toSatisfy((observations) => {
      for (const observation of observations) {
        expect(observation.actual).toBe(
          observation.resolve(observation.productDir, observation.sourcePath),
        );
      }
      return true;
    });
  });

  it.each(sampleReleaseTestValue(arbitraryDocumentationPathAliasCases()))(
    "resolves path alias $configuredPath",
    async (aliasCase) => {
      await expect(
        observeDocumentationPathAliases(
          [aliasCase],
        ),
      ).resolves.toSatisfy((observations) => {
        for (const observation of observations) {
          expect(observation.actualDocumentCount).toBe(1);
          expect(observation.actualSourcePath).toBe(observation.aliasCase.configuredPath);
          expect(observation.actualTargetPath).toBe(observation.canonicalTargetPath);
          expect(observation.actualStagedPath).toBe(
            join(observation.stageWorkingDirectory, observation.aliasCase.canonicalPath),
          );
          expect(observation.actualContent).toBe(observation.aliasCase.content);
        }
        return true;
      });
    },
  );
});
