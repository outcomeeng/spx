import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withSpecTreeEnv lifecycle", () => {
  it("provides current spec-tree helpers and removes the temp product directory after callback return", async () => {
    let observedProductDir = "";

    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      observedProductDir = env.productDir;

      expect(existsSync(env.productDir)).toBe(true);
      expect(env.fixture.entries.length).toBeGreaterThan(0);
      expect(env.memorySource()).toBeDefined();
      expect(env.filesystemSource()).toBeDefined();
      expect(env.materialize).toBeDefined();
      expect(env.readMemorySnapshot).toBeDefined();
      expect(env.readFilesystemSnapshot).toBeDefined();
      expect(env.projectMemory).toBeDefined();
      expect(env.projectFilesystem).toBeDefined();
    });

    expect(observedProductDir.length).toBeGreaterThan(0);
    expect(existsSync(observedProductDir)).toBe(false);
  });
});
