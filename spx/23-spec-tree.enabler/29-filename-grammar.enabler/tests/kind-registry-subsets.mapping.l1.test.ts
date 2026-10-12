import { describe, expect, it } from "vitest";

import { kindRegistrySubsetCases } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry subsets", () => {
  it.each(kindRegistrySubsetCases())("projects the $category registry subset", (testCase) => {
    expect(new Set(testCase.exportedKinds)).toEqual(new Set(testCase.projectedKinds));
    expect(new Set(testCase.exportedSuffixes)).toEqual(new Set(testCase.projectedSuffixes));
  });
});
