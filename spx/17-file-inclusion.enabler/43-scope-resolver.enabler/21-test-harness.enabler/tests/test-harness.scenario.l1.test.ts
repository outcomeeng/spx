import { describe, expect, it } from "vitest";

import {
  artifactFilePath,
  cleanFilePath,
  hiddenFilePath,
  ignoredFilePath,
  integrationConfig,
  multiLayerFilePath,
  writeTestFiles,
} from "@testing/harnesses/file-inclusion/scope-resolver";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("scope-resolver test harness — scenarios", () => {
  it("writeTestFiles materializes every curated exemplar path under the env", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);

      for (const path of [cleanFilePath, artifactFilePath, hiddenFilePath, ignoredFilePath, multiLayerFilePath]) {
        const content = await env.readFile(path);
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });
});
