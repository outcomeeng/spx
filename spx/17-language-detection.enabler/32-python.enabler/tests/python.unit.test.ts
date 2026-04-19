/**
 * Level 1: Unit tests for Python language detection.
 *
 * Spec: spx/41-validation.enabler/21-language-detection.enabler/32-python.enabler/python.md
 *
 * Routing: Pure function with injectable filesystem deps (Stage 3A).
 */

import { describe, expect, it } from "vitest";

import { detectPython, type LanguageDetectionDeps } from "@/validation/discovery/language-finder.js";

const PROJECT_ROOT = "/project";
const PYPROJECT_PATH = `${PROJECT_ROOT}/pyproject.toml`;

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectPython", () => {
  it("GIVEN a project root with pyproject.toml WHEN detecting THEN reports present", () => {
    const deps = makeDeps(new Set([PYPROJECT_PATH]));

    const result = detectPython(PROJECT_ROOT, deps);

    expect(result.present).toBe(true);
  });

  it("GIVEN a project root without pyproject.toml WHEN detecting THEN reports absent", () => {
    const deps = makeDeps(new Set());

    const result = detectPython(PROJECT_ROOT, deps);

    expect(result.present).toBe(false);
  });
});
