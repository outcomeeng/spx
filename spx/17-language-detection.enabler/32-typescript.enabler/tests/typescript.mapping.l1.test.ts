import * as fc from "fast-check";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectTypeScript,
  ESLINT_CONFIG_FILES,
  ESLINT_PRODUCTION_CONFIG_FILES,
  type LanguageDetectionDeps,
  TYPESCRIPT_MARKER,
} from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectTypeScript — mappings", () => {
  it("returns the first matching ESLint config in priority order", () => {
    fc.assert(
      fc.property(
        arbitraryDomainLiteral(),
        fc.subarray([...ESLINT_CONFIG_FILES], { minLength: 1 }),
        (root, presentConfigs) => {
          const existing = new Set([
            join(root, TYPESCRIPT_MARKER),
            ...presentConfigs.map((configFile) => join(root, configFile)),
          ]);
          const result = detectTypeScript(root, makeDeps(existing));
          const expected = ESLINT_CONFIG_FILES.find((configFile) => presentConfigs.includes(configFile));

          expect(result.eslintConfigFile).toBe(expected);
        },
      ),
    );
  });

  it("returns the first matching production ESLint config in priority order", () => {
    fc.assert(
      fc.property(
        arbitraryDomainLiteral(),
        fc.subarray([...ESLINT_PRODUCTION_CONFIG_FILES], { minLength: 1 }),
        (root, presentConfigs) => {
          const existing = new Set([
            join(root, TYPESCRIPT_MARKER),
            join(root, ESLINT_CONFIG_FILES[0]),
            ...presentConfigs.map((configFile) => join(root, configFile)),
          ]);
          const result = detectTypeScript(root, makeDeps(existing));
          const expected = ESLINT_PRODUCTION_CONFIG_FILES.find((configFile) => presentConfigs.includes(configFile));

          expect(result.productionEslintConfigFile).toBe(expected);
        },
      ),
    );
  });

  it("returns a production ESLint config when no base ESLint config exists", () => {
    fc.assert(
      fc.property(
        arbitraryDomainLiteral(),
        fc.subarray([...ESLINT_PRODUCTION_CONFIG_FILES], { minLength: 1 }),
        (root, presentConfigs) => {
          const existing = new Set([
            join(root, TYPESCRIPT_MARKER),
            ...presentConfigs.map((configFile) => join(root, configFile)),
          ]);
          const result = detectTypeScript(root, makeDeps(existing));
          const expected = ESLINT_PRODUCTION_CONFIG_FILES.find((configFile) => presentConfigs.includes(configFile));

          expect(result.eslintConfigFile).toBeUndefined();
          expect(result.productionEslintConfigFile).toBe(expected);
        },
      ),
    );
  });
});
