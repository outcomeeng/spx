import { describe, it } from "vitest";

import { parseRipgrepPaths } from "@/domains/agent/search";

import { arbitraryRipgrepPathList } from "@testing/generators/agent/locator";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — ripgrep path list parsing", () => {
  it("parses a NUL-terminated path list to exactly the paths printed, line terminators included", () => {
    assertProperty(
      arbitraryRipgrepPathList(),
      ({ paths, stdout }): boolean => JSON.stringify(parseRipgrepPaths(stdout)) === JSON.stringify(paths),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
