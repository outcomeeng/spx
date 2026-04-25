import { PRESETS } from "@test/harness/fixture-generator";
import { withSpecEnv } from "@test/harness/with-spec-env";
import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("withSpecEnv", () => {
  describe("bare temp directory", () => {
    it("GIVEN no options WHEN called THEN creates temp directory under os.tmpdir()", async () => {
      let capturedPath: string | undefined;

      await withSpecEnv(async ({ path }) => {
        capturedPath = path;
        expect(path).toContain(tmpdir());
        expect(path).toContain("spx-test-");
        expect(existsSync(path)).toBe(true);
      });

      expect(existsSync(capturedPath!)).toBe(false);
    });

    it("GIVEN callback returns a value WHEN called THEN resolves to that value", async () => {
      const result = await withSpecEnv(async () => 42);
      expect(result).toBe(42);
    });

    it("GIVEN callback returns an object WHEN called THEN resolves to that object", async () => {
      const result = await withSpecEnv(async ({ path }) => ({ path, custom: "value" }));
      expect(result.custom).toBe("value");
      expect(result.path).toContain("spx-test-");
    });
  });

  describe("emptySpecs mode", () => {
    it("GIVEN emptySpecs: true WHEN called THEN creates specs/work/doing structure", async () => {
      await withSpecEnv({ emptySpecs: true }, async ({ path }) => {
        expect(existsSync(join(path, "specs"))).toBe(true);
        expect(existsSync(join(path, "specs", "work", "doing"))).toBe(true);
      });
    });

    it("GIVEN emptySpecs: true WHEN called THEN specs/work/doing is empty", async () => {
      await withSpecEnv({ emptySpecs: true }, async ({ path }) => {
        const contents = readdirSync(join(path, "specs", "work", "doing"));
        expect(contents).toHaveLength(0);
      });
    });

    it("GIVEN emptySpecs: true WHEN completed THEN cleans up the entire tree", async () => {
      let capturedPath: string | undefined;

      await withSpecEnv({ emptySpecs: true }, async ({ path }) => {
        capturedPath = path;
      });

      expect(existsSync(capturedPath!)).toBe(false);
    });
  });

  describe("fixture mode", () => {
    it("GIVEN fixture: PRESETS.MINIMAL WHEN called THEN specs/work/doing contains capability directories", async () => {
      await withSpecEnv({ fixture: PRESETS.MINIMAL }, async ({ path }) => {
        const doingPath = join(path, "specs", "work", "doing");
        expect(existsSync(doingPath)).toBe(true);
        const contents = readdirSync(doingPath);
        expect(contents.some((d) => d.startsWith("capability-"))).toBe(true);
      });
    });

    it("GIVEN fixture: PRESETS.MINIMAL WHEN completed THEN cleans up", async () => {
      let capturedPath: string | undefined;

      await withSpecEnv({ fixture: PRESETS.MINIMAL }, async ({ path }) => {
        capturedPath = path;
        expect(existsSync(path)).toBe(true);
      });

      expect(existsSync(capturedPath!)).toBe(false);
    });

    it("GIVEN fixture config with 2 capabilities WHEN called THEN doing contains exactly 2 capability directories", async () => {
      const config = {
        capabilities: 2,
        featuresPerCapability: 1,
        storiesPerFeature: 1,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
      };

      await withSpecEnv({ fixture: config }, async ({ path }) => {
        const doingPath = join(path, "specs", "work", "doing");
        const contents = readdirSync(doingPath);
        const caps = contents.filter((d) => d.startsWith("capability-"));
        expect(caps.length).toBe(2);
      });
    });

    it("GIVEN both fixture and emptySpecs: true WHEN called THEN fixture takes precedence", async () => {
      await withSpecEnv({ fixture: PRESETS.MINIMAL, emptySpecs: true }, async ({ path }) => {
        const doingPath = join(path, "specs", "work", "doing");
        const contents = readdirSync(doingPath);
        expect(contents.some((d) => d.startsWith("capability-"))).toBe(true);
      });
    });
  });

  describe("cleanup behavior", () => {
    it("GIVEN callback throws WHEN called THEN error propagates and temp directory is deleted", async () => {
      let capturedPath: string | undefined;

      await expect(
        withSpecEnv(async ({ path }) => {
          capturedPath = path;
          throw new Error("test error");
        }),
      ).rejects.toThrow("test error");

      expect(existsSync(capturedPath!)).toBe(false);
    });

    it("GIVEN fixture callback throws WHEN called THEN error propagates and fixture directory is deleted", async () => {
      let capturedPath: string | undefined;

      await expect(
        withSpecEnv({ fixture: PRESETS.MINIMAL }, async ({ path }) => {
          capturedPath = path;
          throw new Error("fixture test error");
        }),
      ).rejects.toThrow("fixture test error");

      expect(existsSync(capturedPath!)).toBe(false);
    });

    it("GIVEN callback deletes the directory WHEN cleanup runs THEN no error is thrown", async () => {
      await withSpecEnv(async ({ path }) => {
        await rm(path, { recursive: true });
      });
    });

    it("GIVEN emptySpecs directory deleted by callback WHEN cleanup runs THEN no error is thrown", async () => {
      await withSpecEnv({ emptySpecs: true }, async ({ path }) => {
        await rm(path, { recursive: true });
      });
    });
  });

  describe("type preservation", () => {
    it("GIVEN async function returning void WHEN called THEN resolves to undefined", async () => {
      const result = await withSpecEnv(async () => {
        // void
      });
      expect(result).toBeUndefined();
    });

    it("GIVEN generic type T WHEN called THEN resolves to a value of type T", async () => {
      interface CustomResult {
        count: number;
        label: string;
      }

      const result = await withSpecEnv<CustomResult>(async () => ({ count: 5, label: "test" }));

      expect(result.count).toBe(5);
      expect(result.label).toBe("test");
    });
  });
});
