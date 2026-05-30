import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { removeTempDir } from "@testing/harnesses/with-temp-dir";

describe("withTestEnv — filesystem safety", () => {
  it("roots every temp directory inside os.tmpdir()", async () => {
    const tmpRoot = resolve(tmpdir());

    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      const productDir = resolve(env.productDir);
      const relativeToTmp = relative(tmpRoot, productDir);

      expect(relativeToTmp.startsWith("..")).toBe(false);
      expect(relativeToTmp === "" || relativeToTmp === ".").toBe(false);
    });
  });

  it("removes the temp directory it created but leaves sibling directories under os.tmpdir() untouched", async () => {
    const sibling = join(tmpdir(), `spx-safety-sibling-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(sibling);

    try {
      let productDir = "";
      await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        productDir = env.productDir;
        expect(productDir).not.toBe(sibling);
      });

      expect(existsSync(productDir)).toBe(false);
      expect(existsSync(sibling)).toBe(true);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it("never exposes a product directory that resolves outside the OS temp root", async () => {
    const tmpRoot = resolve(tmpdir());

    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      const resolvedProject = resolve(env.productDir);
      expect(resolvedProject.startsWith(tmpRoot)).toBe(true);
    });
  });
});

describe("withTempDir — removal safety", () => {
  it("refuses to remove a path that resolves outside os.tmpdir()", async () => {
    const outside = resolve(tmpdir(), "..", sampleLiteralTestValue(arbitraryDomainLiteral()));

    await expect(removeTempDir(outside)).rejects.toThrow();
  });
});
