import { describe, it } from "vitest";

import {
  assertSpecContextClassifiesOverlays,
  assertSpecContextExcludesSymlinkEscapes,
  assertSpecContextIncludesCoordinationAtAllLevels,
  assertSpecContextIncludesGuidesAlongPath,
} from "@testing/harnesses/spec/context";

describe("spec context read set", () => {
  it("includes coordination notes from the product root, ancestors, and the target in walk order", async () => {
    await assertSpecContextIncludesCoordinationAtAllLevels();
  });

  it("includes runtime guides from the product root and node directories along the target path", async () => {
    await assertSpecContextIncludesGuidesAlongPath();
  });

  it("reads the lifecycle overlay and lists every other overlay", async () => {
    await assertSpecContextClassifiesOverlays();
  });

  it("binds no entry for a symbolic link whose canonical target escapes the product directory", async () => {
    await assertSpecContextExcludesSymlinkEscapes();
  });
});
