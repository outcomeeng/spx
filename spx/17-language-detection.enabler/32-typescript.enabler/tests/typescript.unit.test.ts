/**
 * Level 1: Unit tests for TypeScript language detection.
 *
 * Spec: spx/41-validation.enabler/21-language-detection.enabler/32-typescript.enabler/typescript.md
 *
 * Routing: Pure function with injectable filesystem deps (Stage 3A).
 * No doubles — `existsSync` is provided via dependency injection.
 */

import { describe, expect, it } from "vitest";

import {
  detectTypeScript,
  ESLINT_CONFIG_FILES,
  type LanguageDetectionDeps,
} from "@/validation/discovery/language-finder";

const PROJECT_ROOT = "/project";
const TSCONFIG_PATH = `${PROJECT_ROOT}/tsconfig.json`;

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectTypeScript", () => {
  it("GIVEN a project root with tsconfig.json WHEN detecting THEN reports present", () => {
    const deps = makeDeps(new Set([TSCONFIG_PATH]));

    const result = detectTypeScript(PROJECT_ROOT, deps);

    expect(result.present).toBe(true);
  });

  it("GIVEN a project root without tsconfig.json WHEN detecting THEN reports absent", () => {
    const deps = makeDeps(new Set());

    const result = detectTypeScript(PROJECT_ROOT, deps);

    expect(result.present).toBe(false);
  });

  it("GIVEN tsconfig.json and eslint.config.ts WHEN detecting THEN reports the config path", () => {
    const configPath = `${PROJECT_ROOT}/eslint.config.ts`;
    const deps = makeDeps(new Set([TSCONFIG_PATH, configPath]));

    const result = detectTypeScript(PROJECT_ROOT, deps);

    expect(result.present).toBe(true);
    expect(result.eslintConfigFile).toBe(ESLINT_CONFIG_FILES[0]);
  });

  it("GIVEN tsconfig.json with no ESLint config WHEN detecting THEN eslintConfigFile is undefined", () => {
    const deps = makeDeps(new Set([TSCONFIG_PATH]));

    const result = detectTypeScript(PROJECT_ROOT, deps);

    expect(result.present).toBe(true);
    expect(result.eslintConfigFile).toBeUndefined();
  });

  describe("ESLint flat config priority", () => {
    it.each(ESLINT_CONFIG_FILES)(
      "GIVEN only %s exists WHEN detecting THEN returns that config file",
      (configFile) => {
        const deps = makeDeps(new Set([TSCONFIG_PATH, `${PROJECT_ROOT}/${configFile}`]));

        const result = detectTypeScript(PROJECT_ROOT, deps);

        expect(result.eslintConfigFile).toBe(configFile);
      },
    );

    it("GIVEN .ts and .js configs both exist WHEN detecting THEN returns .ts (higher priority)", () => {
      const deps = makeDeps(
        new Set([
          TSCONFIG_PATH,
          `${PROJECT_ROOT}/eslint.config.ts`,
          `${PROJECT_ROOT}/eslint.config.js`,
        ]),
      );

      const result = detectTypeScript(PROJECT_ROOT, deps);

      expect(result.eslintConfigFile).toBe(ESLINT_CONFIG_FILES[0]);
    });

    it("GIVEN all four configs exist WHEN detecting THEN returns .ts (highest priority)", () => {
      const deps = makeDeps(
        new Set([
          TSCONFIG_PATH,
          ...ESLINT_CONFIG_FILES.map((f) => `${PROJECT_ROOT}/${f}`),
        ]),
      );

      const result = detectTypeScript(PROJECT_ROOT, deps);

      expect(result.eslintConfigFile).toBe(ESLINT_CONFIG_FILES[0]);
    });

    it("GIVEN .js and .mjs and .cjs (no .ts) WHEN detecting THEN returns .js", () => {
      const deps = makeDeps(
        new Set([
          TSCONFIG_PATH,
          `${PROJECT_ROOT}/eslint.config.js`,
          `${PROJECT_ROOT}/eslint.config.mjs`,
          `${PROJECT_ROOT}/eslint.config.cjs`,
        ]),
      );

      const result = detectTypeScript(PROJECT_ROOT, deps);

      expect(result.eslintConfigFile).toBe(ESLINT_CONFIG_FILES[1]);
    });

    it("GIVEN .mjs and .cjs (no .ts or .js) WHEN detecting THEN returns .mjs", () => {
      const deps = makeDeps(
        new Set([
          TSCONFIG_PATH,
          `${PROJECT_ROOT}/eslint.config.mjs`,
          `${PROJECT_ROOT}/eslint.config.cjs`,
        ]),
      );

      const result = detectTypeScript(PROJECT_ROOT, deps);

      expect(result.eslintConfigFile).toBe(ESLINT_CONFIG_FILES[2]);
    });
  });
});
