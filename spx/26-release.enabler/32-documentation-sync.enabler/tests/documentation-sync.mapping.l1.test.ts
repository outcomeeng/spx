import {
  observeDocumentationPathAliases,
  observeDocumentationPathMappings,
  observeDocumentationPathSemantics,
  observeIndependentDocumentationConfigResolution,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync path mapping", () => {
  it("maps generated documentation path sets", async () => {
    await expect(observeDocumentationPathMappings()).resolves.toSatisfy((observations) => {
      for (const observation of observations) expect(observation.actual).toEqual(observation.expected);
      return true;
    });
  });

  it("resolves nested slash-separated paths under every supported path semantics", () => {
    expect(observeDocumentationPathSemantics()).toSatisfy((observations) => {
      for (const observation of observations) expect(observation.actual).toBe(observation.expected);
      return true;
    });
  });

  it("resolves configured path aliases to their canonical staged documents", async () => {
    await expect(observeDocumentationPathAliases()).resolves.toSatisfy((observations) => {
      for (const observation of observations) {
        expect(observation.actualDocumentCount).toBe(1);
        expect(observation.actualSourcePath).toBe(observation.expectedSourcePath);
        expect(observation.actualTargetPath).toBe(observation.expectedTargetPath);
        expect(observation.actualStagedPath).toBe(observation.expectedStagedPath);
        expect(observation.actualContent).toBe(observation.expectedContent);
      }
      return true;
    });
  });

  it("resolves release documentation config independently of unrelated sections", async () => {
    await expect(observeIndependentDocumentationConfigResolution()).resolves.toSatisfy(
      ({ actual, expected }) => {
        expect(actual).toEqual(expected);
        return true;
      },
    );
  });
});
