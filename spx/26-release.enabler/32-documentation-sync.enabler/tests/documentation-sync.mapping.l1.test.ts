import { join } from "node:path";

import {
  arbitraryDocumentationConfigIndependenceScenario,
  arbitraryDocumentationPathAliasCases,
  arbitraryNestedDocumentationSyncScenario,
  documentationPathMappingCases,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import {
  observeDocumentationPathAliases,
  observeDocumentationPathMappings,
  observeDocumentationPathSemantics,
  observeIndependentDocumentationConfigResolution,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync path mapping", () => {
  it("maps generated documentation path sets", async () => {
    await expect(observeDocumentationPathMappings(documentationPathMappingCases())).resolves.toSatisfy(
      (observations) => {
        for (const observation of observations) {
          expect(observation.actual).toEqual(observation.mappingCase.expected);
        }
        return true;
      },
    );
  });

  it("resolves nested slash-separated paths under every supported path semantics", () => {
    expect(
      observeDocumentationPathSemantics(
        sampleReleaseTestValue(arbitraryNestedDocumentationSyncScenario()),
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

  it("resolves configured path aliases to their canonical staged documents", async () => {
    await expect(
      observeDocumentationPathAliases(
        sampleReleaseTestValue(arbitraryDocumentationPathAliasCases()),
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
  });

  it("resolves release documentation config independently of unrelated sections", async () => {
    await expect(
      observeIndependentDocumentationConfigResolution(
        sampleReleaseTestValue(arbitraryDocumentationConfigIndependenceScenario()),
      ),
    ).resolves.toSatisfy(
      ({ actual, scenario }) => {
        expect(actual).toEqual(scenario.config);
        return true;
      },
    );
  });
});
