import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  configFileForFormat,
  DEFAULT_CONFIG_FILE_FORMAT,
  DEFAULT_CONFIG_FILENAME,
  parseConfigFileSections,
} from "@/config/index";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
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
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      expect(env.productDir).toBeDefined();
      expect(env.writeNode).toBeDefined();
      expect(env.writeDecision).toBeDefined();
      expect(env.writeRaw).toBeDefined();
      expect(env.readFile).toBeDefined();
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

describe("withTestEnv — cleanup invariance", () => {
  it("runs cleanup exactly once per invocation under random callback outcomes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          outcome: fc.oneof(fc.constant("return" as const), fc.constant("throw" as const)),
          awaits: fc.integer({ min: 0, max: 3 }),
        }),
        async ({ outcome, awaits }) => {
          let productDir = "";

          const run = (): Promise<void> =>
            withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
              productDir = env.productDir;
              for (let i = 0; i < awaits; i++) {
                await Promise.resolve();
              }
              if (outcome === "throw") {
                throw new Error("callback failure");
              }
            });

          if (outcome === "return") {
            await run();
          } else {
            await expect(run()).rejects.toBeInstanceOf(Error);
          }

          expect(productDir.length).toBeGreaterThan(0);
          expect(existsSync(productDir)).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });
});
