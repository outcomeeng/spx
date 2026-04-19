import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

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

describe("withTestEnv — filesystem safety", () => {
  it("roots every temp directory inside os.tmpdir()", async () => {
    const tmpRoot = resolve(tmpdir());

    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      const projectDir = resolve(env.projectDir);
      const relativeToTmp = relative(tmpRoot, projectDir);

      expect(relativeToTmp.startsWith("..")).toBe(false);
      expect(relativeToTmp === "" || relativeToTmp === ".").toBe(false);
    });
  });

  it("removes the temp directory it created but leaves sibling directories under os.tmpdir() untouched", async () => {
    const sibling = join(tmpdir(), `spx-safety-sibling-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(sibling);

    try {
      let projectDir = "";
      await withTestEnv(MINIMAL_CONFIG, async (env) => {
        projectDir = env.projectDir;
        expect(projectDir).not.toBe(sibling);
      });

      expect(existsSync(projectDir)).toBe(false);
      expect(existsSync(sibling)).toBe(true);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it("never exposes a project directory that resolves outside the OS temp root", async () => {
    const tmpRoot = resolve(tmpdir());

    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      const resolvedProject = resolve(env.projectDir);
      expect(resolvedProject.startsWith(tmpRoot)).toBe(true);
    });
  });
});
