import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { TEMP_DIRECTORY_ENV_VAR } from "@/lib/temp-directory";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createTempDir, removeTempDir, withTempDir } from "@testing/harnesses/with-temp-dir";

describe("withTestEnv — filesystem safety", () => {
  it("roots every temp directory inside the run root", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      const runRoot = resolve(process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT] ?? "");
      const productDir = resolve(env.productDir);
      const relativeToRoot = relative(runRoot, productDir);

      expect(process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT]).toBeDefined();
      expect(relativeToRoot.startsWith("..")).toBe(false);
      expect(relativeToRoot === "" || relativeToRoot === ".").toBe(false);
    });
  });

  it("removes the temp directory it created but leaves sibling directories under the run root untouched", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async (sibling) => {
      let productDir = "";
      await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        productDir = env.productDir;
        expect(productDir).not.toBe(sibling);
      });

      expect(existsSync(productDir)).toBe(false);
      expect(existsSync(sibling)).toBe(true);
    });
  });

  it("never exposes a product directory that resolves outside the run root", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      const runRoot = resolve(process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT] ?? "");
      const resolvedProject = resolve(env.productDir);
      expect(resolvedProject.startsWith(runRoot + sep)).toBe(true);
    });
  });
});

describe("withTempDir — removal safety", () => {
  it("refuses to remove a path that resolves outside the run root", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async () => {
      const runRoot = resolve(process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT] ?? "");
      const outside = resolve(runRoot, "..", sampleLiteralTestValue(arbitraryDomainLiteral()));

      await expect(removeTempDir(outside)).rejects.toThrow();
    });
  });

  it("refuses to remove the run root itself and leaves it in place", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async (dir) => {
      const runRoot = resolve(process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT] ?? "");

      await expect(removeTempDir(runRoot)).rejects.toThrow();

      expect(existsSync(runRoot)).toBe(true);
      expect(existsSync(dir)).toBe(true);
    });
  });
});

describe("createTempDir — creation safety", () => {
  it("refuses a prefix that escapes the run root via path traversal", async () => {
    const traversalPrefix = `..${sep}${sampleLiteralTestValue(arbitraryDomainLiteral())}`;

    await expect(createTempDir(traversalPrefix)).rejects.toThrow();
  });
});
