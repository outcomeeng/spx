import { describe, expect, it } from "vitest";

import { VITEST_PACKAGE_NAME, VITEST_RUN_MODE } from "@/test/languages/journal-reporter";
import { expectedFindingsForScenario } from "@testing/generators/testing/journal-reporter";
import {
  observeImportConditionedVitestRun,
  observeProductResolvedStreamingRun,
  observeProductSuppliedVitestRun,
  observeProductsWithoutNodeApi,
  observeRunnerlessStreamingRun,
} from "@testing/harnesses/testing/journal-reporter";
import { readProductRuntimeDependencyNames } from "@testing/harnesses/testing/typescript-runner";

describe("journal-streaming run resolves the Vitest Node API from the product under test", () => {
  it("resolves against the request's product directory and imports the specifier that resolution returned", async () => {
    await observeProductResolvedStreamingRun().then((observation) => {
      expect(observation.loader.resolvedProductDirs).toEqual([observation.request.productDir]);
      expect(observation.loader.loadedSpecifiers).toEqual([
        observation.loader.specifierFor(observation.request.productDir),
      ]);
      expect(observation.sink.scopes).toEqual([{ moduleId: observation.scenario.moduleId }]);
      expect(observation.sink.findings).toEqual(expectedFindingsForScenario(observation.scenario));
      expect(observation.invocation).toEqual({ invoked: true, terminalStatus: observation.reason });
    });
  });

  it("starts the Vitest the product directory supplies through the production loader rather than the harness's own install", async () => {
    await observeProductSuppliedVitestRun().then((observation) => {
      expect(observation.resolution).toEqual({
        resolved: true,
        specifier: observation.productSuppliedEntryPath,
      });
      expect(observation.recordedStart).toEqual({
        mode: VITEST_RUN_MODE,
        files: observation.request.testPaths,
        root: observation.request.productDir,
      });
      expect(observation.invocation).toEqual({ invoked: true, terminalStatus: observation.reason });
    });
  });

  it("resolves a Node API entry the product exposes only under the import condition, the condition the run loads it with", async () => {
    await observeImportConditionedVitestRun().then((observation) => {
      expect(observation.resolution).toEqual({
        resolved: true,
        specifier: observation.productSuppliedEntryPath,
      });
      expect(observation.recordedStart).toEqual({
        mode: VITEST_RUN_MODE,
        files: observation.request.testPaths,
        root: observation.request.productDir,
      });
      expect(observation.invocation).toEqual({ invoked: true, terminalStatus: observation.reason });
    });
  });
});

describe("journal-streaming run over a product that supplies no runner", () => {
  it("reports the unresolvable Vitest Node API as a runner outcome naming the product directory searched", async () => {
    await observeRunnerlessStreamingRun().then((observation) => {
      expect(observation.resolution).toEqual({
        resolved: false,
        productDir: observation.request.productDir,
      });
      expect(observation.invocation).toEqual({
        invoked: false,
        unresolvedRunner: { productDir: observation.request.productDir },
      });
      expect(observation.sink.scopes).toEqual([]);
      expect(observation.sink.findings).toEqual([]);
    });
  });

  it("reports a product whose Vitest package exposes no usable Node API entry the same way, and rethrows a manifest it cannot read", async () => {
    await observeProductsWithoutNodeApi().then((observation) => {
      expect(observation.withoutNodeExport.resolution).toEqual({
        resolved: false,
        productDir: observation.withoutNodeExport.request.productDir,
      });
      expect(observation.withoutNodeExport.invocation).toEqual({
        invoked: false,
        unresolvedRunner: { productDir: observation.withoutNodeExport.request.productDir },
      });
      expect(observation.nodeEntryMissing.resolution).toEqual({
        resolved: false,
        productDir: observation.nodeEntryMissing.request.productDir,
      });
      expect(observation.nodeEntryMissing.invocation).toEqual({
        invoked: false,
        unresolvedRunner: { productDir: observation.nodeEntryMissing.request.productDir },
      });
      expect(observation.withoutNodeExport.sink.scopes).toEqual([]);
      expect(observation.nodeEntryMissing.sink.scopes).toEqual([]);
      expect(observation.malformedManifest.resolutionError).toBeInstanceOf(Error);
    });
  });
});

describe("adapter package runtime dependencies", () => {
  it("never declares Vitest a runtime dependency of the adapter's own package", async () => {
    await expect(readProductRuntimeDependencyNames()).resolves.not.toContain(VITEST_PACKAGE_NAME);
  });
});
