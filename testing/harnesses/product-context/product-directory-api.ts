import { describe, expect, it } from "vitest";

import { LEGACY_PRODUCT_ROOT_FIELD_NAMES, resolveProductDir } from "@/domains/config/root";
import { pythonTestingLanguage } from "@/test/languages/python";
import type { RelatedTestRequest, TestingLanguageDescriptor, TestRunRequest } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

export function registerProductDirectoryApiCompliance(): void {
  describe("product directory API vocabulary", () => {
    it("resolveProductDir exposes productDir without legacy root aliases", async () => {
      const cwd = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const gitToplevel = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.productDir(),
      );

      const result = resolveProductDir(cwd, {
        readGitToplevel: () => gitToplevel,
      });

      expect(result).toEqual({ productDir: gitToplevel });
      for (const legacyField of LEGACY_PRODUCT_ROOT_FIELD_NAMES) {
        expect(legacyField in result).toBe(false);
      }
    });

    it("resolveProductDir fallback exposes productDir without legacy root aliases", async () => {
      const cwd = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

      const result = resolveProductDir(cwd, {
        readGitToplevel: () => undefined,
      });

      expect(result.productDir).toBe(cwd);
      expect(result.warning).toContain(cwd);
      for (const legacyField of LEGACY_PRODUCT_ROOT_FIELD_NAMES) {
        expect(legacyField in result).toBe(false);
      }
    });

    it.each<TestingLanguageDescriptor>([
      typescriptTestingLanguage,
      pythonTestingLanguage,
    ])("$name testing descriptor receives productDir through detection and invocation", async (language) => {
      const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const observedProductDirs: string[] = [];
      const request: TestRunRequest = {
        productDir,
        testPaths: [],
        excludedNodePaths: [],
      };

      const result = await language.runTests(request, {
        isLanguagePresent: (observedProductDir) => {
          observedProductDirs.push(observedProductDir);
          return true;
        },
        runCommand: () => Promise.resolve({ exitCode: 0 }),
      });

      expect(result.invoked).toBe(true);
      expect(observedProductDirs).toEqual([productDir]);
      for (const legacyField of LEGACY_PRODUCT_ROOT_FIELD_NAMES) {
        expect(legacyField in request).toBe(false);
      }
    });

    it("related-test requests expose productDir without legacy root aliases", async () => {
      const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const observedProductDirs: string[] = [];
      const request: RelatedTestRequest = {
        productDir,
        sourcePaths: [],
        candidateTestPaths: [],
        baseRef: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      };

      const result = await typescriptTestingLanguage.relatedTestPaths?.(request, {
        isLanguagePresent: (observedProductDir) => {
          observedProductDirs.push(observedProductDir);
          return false;
        },
        runCommand: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
        readFile: () => Promise.reject(new Error("language detection must short-circuit file reads")),
      });

      expect(result).toEqual({ testPaths: [], resolvedSourcePaths: [] });
      expect(observedProductDirs).toEqual([productDir]);
      for (const legacyField of LEGACY_PRODUCT_ROOT_FIELD_NAMES) {
        expect(legacyField in request).toBe(false);
      }
    });
  });
}
