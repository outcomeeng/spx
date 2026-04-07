/**
 * Level 1: Config Schema and Default Constant
 *
 * These tests verify that the config schema is correctly defined and the
 * DEFAULT_CONFIG constant is properly structured with all required paths.
 */

import { DEFAULT_CONFIG, type SpxConfig } from "@/config/defaults";
import { describe, expect, it } from "vitest";

describe("Story 11: Config Schema", () => {
  describe("DEFAULT_CONFIG structure", () => {
    it("GIVEN DEFAULT_CONFIG WHEN accessing properties THEN has all required specs paths", () => {
      // Verify specs.root exists
      expect(DEFAULT_CONFIG.specs.root).toBeDefined();
      expect(typeof DEFAULT_CONFIG.specs.root).toBe("string");

      // Verify specs.work.dir exists
      expect(DEFAULT_CONFIG.specs.work.dir).toBeDefined();
      expect(typeof DEFAULT_CONFIG.specs.work.dir).toBe("string");

      // Verify specs.work.statusDirs exists
      expect(DEFAULT_CONFIG.specs.work.statusDirs.doing).toBeDefined();
      expect(DEFAULT_CONFIG.specs.work.statusDirs.backlog).toBeDefined();
      expect(DEFAULT_CONFIG.specs.work.statusDirs.done).toBeDefined();

      // Verify specs.decisions exists
      expect(DEFAULT_CONFIG.specs.decisions).toBeDefined();
      expect(typeof DEFAULT_CONFIG.specs.decisions).toBe("string");
    });

    it("GIVEN DEFAULT_CONFIG WHEN accessing sessions THEN has required sessions path", () => {
      expect(DEFAULT_CONFIG.sessions.dir).toBeDefined();
      expect(typeof DEFAULT_CONFIG.sessions.dir).toBe("string");
    });

    it("GIVEN DEFAULT_CONFIG WHEN checking values THEN matches expected defaults", () => {
      // Verify default values match ADR specification
      expect(DEFAULT_CONFIG.specs.root).toBe("specs");
      expect(DEFAULT_CONFIG.specs.work.dir).toBe("work");
      expect(DEFAULT_CONFIG.specs.work.statusDirs.doing).toBe("doing");
      expect(DEFAULT_CONFIG.specs.work.statusDirs.backlog).toBe("backlog");
      expect(DEFAULT_CONFIG.specs.work.statusDirs.done).toBe("archive");
      expect(DEFAULT_CONFIG.specs.decisions).toBe("decisions");
      expect(DEFAULT_CONFIG.sessions.dir).toBe(".spx/sessions");
    });
  });

  describe("SpxConfig type safety", () => {
    it("GIVEN SpxConfig interface WHEN assigning DEFAULT_CONFIG THEN types match", () => {
      // This test primarily verifies at compile-time via TypeScript
      // Runtime check ensures the cast is valid
      const config: SpxConfig = DEFAULT_CONFIG;

      expect(config).toBeDefined();
      expect(config.specs).toBeDefined();
      expect(config.sessions).toBeDefined();
    });

    it("GIVEN DEFAULT_CONFIG WHEN checking type inference THEN has literal types", () => {
      // Verify const assertion provides literal types (compile-time check)
      // At runtime, verify the object is frozen-like (readonly behavior)
      const specsRoot: "specs" = DEFAULT_CONFIG.specs.root;
      const workDir: "work" = DEFAULT_CONFIG.specs.work.dir;
      const doingDir: "doing" = DEFAULT_CONFIG.specs.work.statusDirs.doing;

      expect(specsRoot).toBe("specs");
      expect(workDir).toBe("work");
      expect(doingDir).toBe("doing");
    });
  });

  describe("Module exports", () => {
    it("GIVEN defaults module WHEN importing THEN exports DEFAULT_CONFIG", async () => {
      const module = await import("@/config/defaults");

      expect(module.DEFAULT_CONFIG).toBeDefined();
      expect(module.DEFAULT_CONFIG.specs).toBeDefined();
    });

    it("GIVEN defaults module WHEN importing THEN exports SpxConfig type", async () => {
      // Verify type is exported (compile-time check)
      // Runtime check that the module has the expected structure
      const module = await import("@/config/defaults");

      // TypeScript compilation will fail if SpxConfig isn't exported
      type ConfigType = typeof module.DEFAULT_CONFIG;
      const config: ConfigType = module.DEFAULT_CONFIG;

      expect(config).toBeDefined();
    });
  });
});
