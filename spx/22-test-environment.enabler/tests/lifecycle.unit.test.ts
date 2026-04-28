import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

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

describe("withTestEnv — startup", () => {
  it("creates a fresh temp directory under os.tmpdir() and materializes spx.config.yaml from the Config", async () => {
    let observedProjectDir = "";
    let observedConfig: unknown = null;

    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      observedProjectDir = env.projectDir;
      const raw = await readFile(join(env.projectDir, "spx.config.yaml"), "utf8");
      observedConfig = parseYaml(raw);
    });

    expect(observedProjectDir.startsWith(tmpdir())).toBe(true);
    expect(observedConfig).toEqual(MINIMAL_CONFIG);
  });

  it("invokes the callback with an env object exposing projectDir and write helpers", async () => {
    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      expect(typeof env.projectDir).toBe("string");
      expect(typeof env.writeNode).toBe("function");
      expect(typeof env.writeDecision).toBe("function");
      expect(typeof env.writeRaw).toBe("function");
      expect(typeof env.readFile).toBe("function");
    });
  });

  it("returns distinct temp directories on repeated invocations", async () => {
    const observed: string[] = [];

    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      observed.push(env.projectDir);
    });
    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      observed.push(env.projectDir);
    });

    expect(observed[0]).not.toBe(observed[1]);
  });
});

describe("withTestEnv — cleanup on return", () => {
  it("removes the temp directory after the callback returns normally", async () => {
    let projectDir = "";

    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      projectDir = env.projectDir;
      const before = await stat(projectDir);
      expect(before.isDirectory()).toBe(true);
    });

    expect(existsSync(projectDir)).toBe(false);
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
    let projectDir = "";
    const boom = new TestBoomError("callback blew up");

    await expect(
      withTestEnv(MINIMAL_CONFIG, async (env) => {
        projectDir = env.projectDir;
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(existsSync(projectDir)).toBe(false);
  });

  it("propagates non-Error rejections unchanged while still cleaning up", async () => {
    let projectDir = "";
    const rejection = { code: "NON_ERROR", detail: 42 } as const;

    await expect(
      withTestEnv(MINIMAL_CONFIG, async (env) => {
        projectDir = env.projectDir;
        return Promise.reject(rejection);
      }),
    ).rejects.toBe(rejection);

    expect(existsSync(projectDir)).toBe(false);
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
          let projectDir = "";

          const run = (): Promise<void> =>
            withTestEnv(MINIMAL_CONFIG, async (env) => {
              projectDir = env.projectDir;
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

          expect(projectDir.length).toBeGreaterThan(0);
          expect(existsSync(projectDir)).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });
});
