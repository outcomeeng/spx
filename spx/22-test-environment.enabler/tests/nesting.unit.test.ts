import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

const MINIMAL_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
};

describe("withTestEnv — nested invocations", () => {
  it("removes only the inner temp directory when the inner callback returns, leaving the outer directory intact for the outer callback", async () => {
    await withTestEnv(MINIMAL_CONFIG, async (outer) => {
      let innerDir = "";

      await withTestEnv(MINIMAL_CONFIG, async (inner) => {
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

    await withTestEnv(MINIMAL_CONFIG, async (outer) => {
      outerDir = outer.projectDir;
      await withTestEnv(MINIMAL_CONFIG, async (inner) => {
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
      withTestEnv(MINIMAL_CONFIG, async (outer) => {
        outerDir = outer.projectDir;
        await withTestEnv(MINIMAL_CONFIG, async (inner) => {
          innerDir = inner.projectDir;
        });
        throw new Error("outer-fail");
      }),
    ).rejects.toThrow("outer-fail");

    expect(existsSync(innerDir)).toBe(false);
    expect(existsSync(outerDir)).toBe(false);
  });
});
