import { describe, expect, it } from "vitest";

import { withoutGitEnvironment } from "@/lib/git/environment";
import { arbitraryGitEnvironment } from "@testing/generators/git-environment/git-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("read-only git environment properties", () => {
  it("drops every Git variable except the ceiling and keeps every other variable unchanged", () => {
    assertProperty(
      arbitraryGitEnvironment(),
      ({ environment, retained }) => {
        expect(withoutGitEnvironment(environment)).toEqual(retained);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
