import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withTestEnv — nested invocations", () => {
  it("removes only the inner temp directory when the inner callback returns, leaving the outer directory intact for the outer callback", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (outer) => {
      let innerDir = "";

      await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (inner) => {
        innerDir = inner.projectDir;
        expect(inner.projectDir).not.toBe(outer.projectDir);
        expect(existsSync(outer.projectDir)).toBe(true);
        expect(existsSync(inner.projectDir)).toBe(true);
      });

      expect(existsSync(innerDir)).toBe(false);
      expect(existsSync(outer.projectDir)).toBe(true);
    });
  });

  it("removes both directories once their respective callbacks return", async () => {
    let outerDir = "";
    let innerDir = "";

    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (outer) => {
      outerDir = outer.projectDir;
      await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (inner) => {
        innerDir = inner.projectDir;
      });
    });

    expect(existsSync(innerDir)).toBe(false);
    expect(existsSync(outerDir)).toBe(false);
  });

  it("removes the outer temp directory when the outer callback throws after the inner callback returns", async () => {
    let outerDir = "";
    let innerDir = "";

    await expect(
      withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (outer) => {
        outerDir = outer.projectDir;
        await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (inner) => {
          innerDir = inner.projectDir;
        });
        throw new Error("outer-fail");
      }),
    ).rejects.toThrow("outer-fail");

    expect(existsSync(innerDir)).toBe(false);
    expect(existsSync(outerDir)).toBe(false);
  });
});
