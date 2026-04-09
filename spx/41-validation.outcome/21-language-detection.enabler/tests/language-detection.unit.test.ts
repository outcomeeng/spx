/**
 * Level 1: Unit tests for language detection.
 *
 * Spec: spx/41-validation.outcome/21-language-detection.enabler/language-detection.md
 *
 * Routing: Pure function with injectable filesystem deps (Stage 3A).
 * No doubles — `existsSync` is provided via dependency injection with a
 * type-safe, in-memory implementation.
 */

import { describe, expect, it } from "vitest";

import { detectLanguages, type LanguageDetectionDeps } from "@/validation/discovery/language-finder.js";

const PROJECT_ROOT = "/project";
const TSCONFIG_PATH = `${PROJECT_ROOT}/tsconfig.json`;
const PYPROJECT_PATH = `${PROJECT_ROOT}/pyproject.toml`;

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectLanguages", () => {
  it("GIVEN a project with tsconfig.json WHEN detecting languages THEN TypeScript is present", () => {
    const deps = makeDeps(new Set([TSCONFIG_PATH]));

    const result = detectLanguages(PROJECT_ROOT, deps);

    expect(result.typescript.present).toBe(true);
    expect(result.python.present).toBe(false);
  });

  it("GIVEN a project with pyproject.toml WHEN detecting languages THEN Python is present", () => {
    const deps = makeDeps(new Set([PYPROJECT_PATH]));

    const result = detectLanguages(PROJECT_ROOT, deps);

    expect(result.python.present).toBe(true);
    expect(result.typescript.present).toBe(false);
  });

  it("GIVEN a project with both marker files WHEN detecting languages THEN both languages are present", () => {
    const deps = makeDeps(new Set([TSCONFIG_PATH, PYPROJECT_PATH]));

    const result = detectLanguages(PROJECT_ROOT, deps);

    expect(result.typescript.present).toBe(true);
    expect(result.python.present).toBe(true);
  });

  it("GIVEN a project with no marker files WHEN detecting languages THEN no languages are present", () => {
    const deps = makeDeps(new Set());

    const result = detectLanguages(PROJECT_ROOT, deps);

    expect(result.typescript.present).toBe(false);
    expect(result.python.present).toBe(false);
  });

  it("GIVEN the same project root WHEN detecting languages twice THEN results are identical", () => {
    const deps = makeDeps(new Set([TSCONFIG_PATH]));

    const firstResult = detectLanguages(PROJECT_ROOT, deps);
    const secondResult = detectLanguages(PROJECT_ROOT, deps);

    expect(firstResult).toEqual(secondResult);
  });
});
