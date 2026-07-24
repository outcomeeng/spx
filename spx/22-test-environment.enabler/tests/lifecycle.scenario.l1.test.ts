import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  configFileForFormat,
  DEFAULT_CONFIG_FILE_FORMAT,
  DEFAULT_CONFIG_FILENAME,
  parseConfigFileSections,
} from "@/config/index";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { TEST_ENVIRONMENT_GENERATOR } from "@testing/generators/test-environment/test-environment";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withTestEnv — startup", () => {
  it("creates a fresh temp directory under os.tmpdir() and materializes the product config from the Config", async () => {
    let observedProductDir = "";
    let observedConfig: unknown = null;

    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      observedProductDir = env.productDir;
      const raw = (await readFile(join(env.productDir, DEFAULT_CONFIG_FILENAME))).toString();
      const parsed = parseConfigFileSections(configFileForFormat(env.productDir, DEFAULT_CONFIG_FILE_FORMAT, raw));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        observedConfig = parsed.value;
      }
    });

    expect(observedProductDir.startsWith(tmpdir())).toBe(true);
    expect(observedConfig).toEqual(MINIMAL_SPEC_TREE_CONFIG);
  });

  it("invokes the callback with an env object exposing productDir and write helpers", async () => {
    const generated = sampleConfigTestValue(TEST_ENVIRONMENT_GENERATOR.helperCases(MINIMAL_SPEC_TREE_CONFIG));
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.writeNode(generated.node.fixturePath, generated.node.contents);
      await env.writeDecision(generated.decision.fixturePath, generated.decision.contents);
      await env.writeRaw(generated.raw.fixturePath, generated.raw.contents);

      expect(await env.readFile(generated.node.fixturePath)).toBe(generated.node.contents);
      expect(await env.readFile(generated.decision.fixturePath)).toBe(generated.decision.contents);
      expect(await env.readFile(generated.raw.fixturePath)).toBe(generated.raw.contents);
      expect(env.productDir.startsWith(tmpdir())).toBe(true);
    });
  });

  it("returns distinct temp directories on repeated invocations", async () => {
    const observed: string[] = [];

    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      observed.push(env.productDir);
    });
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      observed.push(env.productDir);
    });

    expect(observed[0]).not.toBe(observed[1]);
  });
});

describe("withTestEnv — cleanup on return", () => {
  it("removes the temp directory after the callback returns normally", async () => {
    let productDir = "";

    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      productDir = env.productDir;
      const before = await stat(productDir);
      expect(before.isDirectory()).toBe(true);
    });

    expect(existsSync(productDir)).toBe(false);
  });
});

describe("withTestEnv — cleanup on throw", () => {
  class TestBoomError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TestBoomError";
    }
  }

  it("removes the temp directory when the callback throws, and rethrows the original error unchanged", async () => {
    let productDir = "";
    const boom = new TestBoomError("callback blew up");

    await expect(
      withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        productDir = env.productDir;
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(existsSync(productDir)).toBe(false);
  });

  it("propagates non-Error rejections unchanged while still cleaning up", async () => {
    let productDir = "";
    const rejection = { code: "NON_ERROR", detail: 42 } as const;

    await expect(
      withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        productDir = env.productDir;
        return Promise.reject(rejection);
      }),
    ).rejects.toBe(rejection);

    expect(existsSync(productDir)).toBe(false);
  });
});
