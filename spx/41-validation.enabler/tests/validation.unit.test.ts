/**
 * Level 1: Unit tests for validation subtree structural mappings.
 *
 * Spec: spx/41-validation.enabler/validation.md
 *
 * Routing: Stage 3A. Pure computation — the Mapping assertions (M1, M2)
 * describe the spec-tree's structural layout: each language validation node
 * has exactly the declared leaf enabler children. Verifying this is a pure
 * directory-listing operation.
 */

import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VALIDATION_ROOT = resolve(__dirname, "..");
const ENABLER_SUFFIX = ".enabler";
const INDEX_SLUG_PATTERN = /^\d+-(.+)\.enabler$/;

const TYPESCRIPT_VALIDATION_DIR = resolve(VALIDATION_ROOT, "32-typescript-validation.enabler");
const PYTHON_VALIDATION_DIR = resolve(VALIDATION_ROOT, "32-python-validation.enabler");

const TYPESCRIPT_EXPECTED_CHILDREN = new Set([
  "lint",
  "type-check",
  "ast-enforcement",
  "circular-deps",
  "literal-reuse",
]);
const PYTHON_EXPECTED_CHILDREN = new Set(["lint", "type-check", "ast-enforcement"]);

/**
 * List the leaf enabler child slugs of a language validation node.
 *
 * @param directory - Absolute path to the language validation enabler directory
 * @returns Set of child slugs (without index prefix or `.enabler` suffix)
 */
function listEnablerChildSlugs(directory: string): Set<string> {
  const entries = readdirSync(directory, { withFileTypes: true });
  const slugs = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith(ENABLER_SUFFIX)) continue;
    const match = entry.name.match(INDEX_SLUG_PATTERN);
    if (!match) continue;
    slugs.add(match[1]);
  }
  return slugs;
}

describe("validation subtree structural mappings (Mappings)", () => {
  it("M1 TypeScript has exactly lint, type-check, ast-enforcement, circular-deps, and literal-reuse leaf enabler children", () => {
    const slugs = listEnablerChildSlugs(TYPESCRIPT_VALIDATION_DIR);

    expect(slugs).toEqual(TYPESCRIPT_EXPECTED_CHILDREN);
  });

  it("M2 Python has exactly lint, type-check, and ast-enforcement leaf enabler children", () => {
    const slugs = listEnablerChildSlugs(PYTHON_VALIDATION_DIR);

    expect(slugs).toEqual(PYTHON_EXPECTED_CHILDREN);
  });
});
