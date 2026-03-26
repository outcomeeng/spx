/**
 * Level 1: Unit tests for argument builder functions
 * Story: story-45_extract-validation-core
 *
 * Tests pure functions that build CLI arguments for validation tools.
 * These functions are testable without external dependencies.
 */

import { describe, expect, it } from "vitest";

import { buildEslintArgs, buildTypeScriptArgs, CACHE_PATHS, VALIDATION_SCOPES } from "../../../src/validation/index.js";

describe("buildEslintArgs", () => {
  describe("full project mode", () => {
    it("GIVEN no files WHEN building args THEN includes eslint config and cache", () => {
      const args = buildEslintArgs({
        cacheFile: CACHE_PATHS.ESLINT,
      });

      expect(args).toContain("eslint");
      expect(args).toContain(".");
      expect(args).toContain("--config");
      expect(args).toContain("eslint.config.ts");
      expect(args).toContain("--cache");
      expect(args).toContain("--cache-location");
      expect(args).toContain(CACHE_PATHS.ESLINT);
    });

    it("GIVEN write mode WHEN building args THEN includes --fix", () => {
      const args = buildEslintArgs({
        mode: "write",
        cacheFile: CACHE_PATHS.ESLINT,
      });

      expect(args).toContain("--fix");
    });

    it("GIVEN read mode WHEN building args THEN does not include --fix", () => {
      const args = buildEslintArgs({
        mode: "read",
        cacheFile: CACHE_PATHS.ESLINT,
      });

      expect(args).not.toContain("--fix");
    });
  });

  describe("file-specific mode", () => {
    it("GIVEN specific files WHEN building args THEN includes files after --", () => {
      const files = ["src/index.ts", "src/cli.ts"];
      const args = buildEslintArgs({
        validatedFiles: files,
        cacheFile: CACHE_PATHS.ESLINT,
      });

      expect(args).toContain("--");
      expect(args).toContain("src/index.ts");
      expect(args).toContain("src/cli.ts");
      // Should not include "." for full project
      expect(args.indexOf(".")).toBe(-1);
    });

    it("GIVEN specific files and write mode WHEN building args THEN includes both --fix and files", () => {
      const files = ["src/index.ts"];
      const args = buildEslintArgs({
        validatedFiles: files,
        mode: "write",
        cacheFile: CACHE_PATHS.ESLINT,
      });

      expect(args).toContain("--fix");
      expect(args).toContain("--");
      expect(args).toContain("src/index.ts");
    });
  });
});

describe("buildTypeScriptArgs", () => {
  it("GIVEN full scope WHEN building args THEN uses --noEmit without --project", () => {
    const args = buildTypeScriptArgs({
      scope: VALIDATION_SCOPES.FULL,
      configFile: "tsconfig.json",
    });

    expect(args).toEqual(["tsc", "--noEmit"]);
    expect(args).not.toContain("--project");
  });

  it("GIVEN production scope WHEN building args THEN uses --project with config file", () => {
    const args = buildTypeScriptArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      configFile: "tsconfig.production.json",
    });

    expect(args).toEqual(["tsc", "--project", "tsconfig.production.json"]);
    expect(args).not.toContain("--noEmit");
  });
});
