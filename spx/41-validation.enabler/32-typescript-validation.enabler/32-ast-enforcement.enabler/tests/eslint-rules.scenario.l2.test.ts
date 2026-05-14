import type { ESLint } from "eslint";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { readTypeScriptExcludeGlobs } from "@/validation/eslint-config-exclusions";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  validationConfigSeverityScenarios,
  validationLintScenarios,
  validationRuleRegistrationCases,
  validationTypeScriptExclusionsScenario,
} from "@testing/generators/validation/ast-enforcement";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  createValidationEslint,
  lintValidationText,
  messagesForRule,
  severityOf,
} from "@testing/harnesses/validation/eslint";

describe("ESLint rules integration", () => {
  let eslint: ESLint;

  beforeAll(() => {
    eslint = createValidationEslint();
  });

  describe("plugin registration", () => {
    for (const testCase of validationRuleRegistrationCases()) {
      it(testCase.title, async () => {
        const config = await eslint.calculateConfigForFile(testCase.filePath);

        for (const ruleId of testCase.ruleIds) {
          expect(config.rules).toHaveProperty(ruleId);
        }
      });
    }
  });

  describe("configured severity", () => {
    for (const testCase of validationConfigSeverityScenarios()) {
      it(testCase.title, async () => {
        const config = await eslint.calculateConfigForFile(testCase.filePath);

        for (const expectation of testCase.expectations) {
          expect(severityOf(config.rules[expectation.ruleId])).toBe(expectation.severity);
        }
      });
    }
  });

  describe("production lint behavior", () => {
    for (const testCase of validationLintScenarios()) {
      it(testCase.title, async () => {
        const result = await lintValidationText(eslint, testCase);

        for (const expectation of testCase.expectations) {
          const messages = messagesForRule(result, expectation.ruleId);

          expect(messages).toHaveLength(expectation.count);

          if (expectation.severity !== undefined) {
            for (const message of messages) {
              expect(message.severity).toBe(expectation.severity);
            }
          }
        }
      });
    }
  });

  describe("TypeScript config exclusions", () => {
    it("fails loudly when the configured TypeScript config cannot be read", () => {
      const testCase = validationTypeScriptExclusionsScenario();

      expect(() =>
        readTypeScriptExcludeGlobs(testCase.missingConfigFile)
      ).toThrow(testCase.missingConfigFile);
    });

    it("reads exclusions through relative TypeScript config extends", async () => {
      const testCase = validationTypeScriptExclusionsScenario();

      await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw }) => {
        await writeRaw(
          testCase.baseConfigFile,
          JSON.stringify(testCase.baseConfig),
        );
        await writeRaw(
          testCase.childConfigFile,
          JSON.stringify(testCase.childConfig),
        );

        const ignorePatterns = readTypeScriptExcludeGlobs(join(productDir, testCase.childConfigFile));

        expect(ignorePatterns).toEqual(expect.arrayContaining([...testCase.expectedGlobs]));
      });
    });

    it("reads exclusions through package TypeScript config extends", async () => {
      const testCase = validationTypeScriptExclusionsScenario();

      await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw }) => {
        await writeRaw(
          testCase.packageConfigFile,
          JSON.stringify(testCase.packageConfig),
        );
        await writeRaw(
          testCase.packageManifestFile,
          JSON.stringify(testCase.packageManifest),
        );
        await writeRaw(
          testCase.childConfigFile,
          JSON.stringify(testCase.packageChildConfig),
        );

        const ignorePatterns = readTypeScriptExcludeGlobs(join(productDir, testCase.childConfigFile));

        expect(ignorePatterns).toEqual(expect.arrayContaining([...testCase.expectedPackageGlobs]));
      });
    });
  });
});
