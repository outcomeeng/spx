import { readFile as nativeReadFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { TEST_ENVIRONMENT_GENERATOR } from "@testing/generators/test-environment/test-environment";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withTestEnv — writeNode", () => {
  it("writes a node spec file under the temp product directory and a subsequent read observes the change", async () => {
    const generated = sampleConfigTestValue(TEST_ENVIRONMENT_GENERATOR.helperCases(MINIMAL_SPEC_TREE_CONFIG)).node;
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeNode, readFile }) => {
      await writeNode(generated.fixturePath, generated.contents);

      const viaEnv = await readFile(generated.fixturePath);
      const viaDisk = (await nativeReadFile(join(productDir, generated.fixturePath))).toString();

      expect(viaEnv).toBe(generated.contents);
      expect(viaDisk).toBe(generated.contents);
    });
  });
});

describe("withTestEnv — writeDecision", () => {
  it("writes a decision record file under the temp product directory and readFile sees it", async () => {
    const generated = sampleConfigTestValue(TEST_ENVIRONMENT_GENERATOR.helperCases(MINIMAL_SPEC_TREE_CONFIG)).decision;
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ writeDecision, readFile }) => {
      await writeDecision(generated.fixturePath, generated.contents);

      const viaEnv = await readFile(generated.fixturePath);

      expect(viaEnv).toBe(generated.contents);
    });
  });
});

describe("withTestEnv — writeRaw", () => {
  it("writes arbitrary bytes at the given relative path under the temp product directory", async () => {
    const generated = sampleConfigTestValue(TEST_ENVIRONMENT_GENERATOR.helperCases(MINIMAL_SPEC_TREE_CONFIG)).raw;
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw, readFile }) => {
      await writeRaw(generated.fixturePath, generated.contents);

      const viaEnv = await readFile(generated.fixturePath);
      const viaDisk = (await nativeReadFile(join(productDir, generated.fixturePath))).toString();

      expect(viaEnv).toBe(generated.contents);
      expect(viaDisk).toBe(generated.contents);
    });
  });
});

describe("withTestEnv — readFile", () => {
  it("reads the materialized product config file at the root", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ readFile }) => {
      const raw = await readFile(DEFAULT_CONFIG_FILENAME);
      expect(raw.length).toBeGreaterThan(0);
    });
  });
});
