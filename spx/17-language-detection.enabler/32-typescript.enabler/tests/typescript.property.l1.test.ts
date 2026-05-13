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

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectTypeScript — properties", () => {
  it("reports present iff path.join(root, TYPESCRIPT_MARKER) is in existsSync", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (root, markerPresent) => {
        const existing = new Set(markerPresent ? [join(root, TYPESCRIPT_MARKER)] : []);
        const result = detectTypeScript(root, makeDeps(existing));
        expect(result.present).toBe(markerPresent);
      }),
    );
  });

  it("eslintConfigFile is undefined when TypeScript is absent", () => {
    fc.assert(
      fc.property(fc.string(), (root) => {
        const result = detectTypeScript(root, makeDeps(new Set()));
        expect(result.eslintConfigFile).toBeUndefined();
        expect(result.productionEslintConfigFile).toBeUndefined();
      }),
    );
  });

  it("eslintConfigFile is undefined when TypeScript is present but no ESLint config exists", () => {
    fc.assert(
      fc.property(fc.string(), (root) => {
        const result = detectTypeScript(root, makeDeps(new Set([join(root, TYPESCRIPT_MARKER)])));
        expect(result.eslintConfigFile).toBeUndefined();
      }),
    );
  });

  it("returns the first matching ESLint config in ESLINT_CONFIG_FILES priority order", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.subarray([...ESLINT_CONFIG_FILES], { minLength: 1 }),
        (root, presentConfigs) => {
          const existing = new Set([
            join(root, TYPESCRIPT_MARKER),
            ...presentConfigs.map((f) => join(root, f)),
          ]);
          const result = detectTypeScript(root, makeDeps(existing));
          const expected = ESLINT_CONFIG_FILES.find((f) => presentConfigs.includes(f));
          expect(result.eslintConfigFile).toBe(expected);
        },
      ),
    );
  });

  it("returns the first matching production ESLint config in priority order", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.subarray([...ESLINT_PRODUCTION_CONFIG_FILES], { minLength: 1 }),
        (root, presentConfigs) => {
          const existing = new Set([
            join(root, TYPESCRIPT_MARKER),
            join(root, ESLINT_CONFIG_FILES[0]),
            ...presentConfigs.map((f) => join(root, f)),
          ]);
          const result = detectTypeScript(root, makeDeps(existing));
          const expected = ESLINT_PRODUCTION_CONFIG_FILES.find((f) => presentConfigs.includes(f));
          expect(result.productionEslintConfigFile).toBe(expected);
        },
      ),
    );
  });

  it("returns a production ESLint config when no base ESLint config exists", () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(...ESLINT_PRODUCTION_CONFIG_FILES), (root, productionConfig) => {
        const result = detectTypeScript(
          root,
          makeDeps(new Set([join(root, TYPESCRIPT_MARKER), join(root, productionConfig)])),
        );

        expect(result.eslintConfigFile).toBeUndefined();
        expect(result.productionEslintConfigFile).toBe(productionConfig);
      }),
    );
  });
});
