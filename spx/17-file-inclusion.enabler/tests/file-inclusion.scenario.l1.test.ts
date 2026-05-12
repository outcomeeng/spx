import { describe, expect, it } from "vitest";

import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { resolveConfig } from "@/config";
import {
  EXPLICIT_OVERRIDE_LAYER,
  FILE_INCLUSION_SECTION,
  fileInclusionConfigDescriptor,
  REGISTERED_TOOL_NAMES,
  resolveScope,
  TOOL_DEFAULT_FLAGS,
  toToolArguments,
} from "@/lib/file-inclusion";
import type { ToolAdaptersConfig } from "@/lib/file-inclusion";
import { HIDDEN_PREFIX_LAYER } from "@/lib/file-inclusion/predicates/hidden-prefix";
import { IGNORE_SOURCE_LAYER } from "@/lib/file-inclusion/predicates/ignore-source";
import { CONFIG_GENERATOR, sampleConfigValue } from "@testing/generators/config/config";

import {
  artifactFilePath,
  cleanFilePath,
  excludedNodeSegment,
  hiddenFilePath,
  ignoredFilePath,
  integrationConfig,
  resolverConfig,
  writeExclude,
  writeTestFiles,
} from "../43-scope-resolver.enabler/tests/support";

const testTool = REGISTERED_TOOL_NAMES[0];
if (!testTool) throw new Error("file-inclusion: no registered tools");

describe("file-inclusion service — scenarios", () => {
  it("explicit paths are included with explicit-override as first decision trail entry regardless of layer membership", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeExclude(env, [excludedNodeSegment]);
      const result = await resolveScope(env.productDir, { explicit: [artifactFilePath] }, resolverConfig);
      const entry = result.included.find((e) => e.path === artifactFilePath);
      expect(entry, `scope.included missing entry for "${artifactFilePath}"`).toBeDefined();
      expect(entry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);
    });
  });

  it("walked scope excludes artifact-directory, hidden-prefix, and ignore-source entries with responsible layer in decision trail", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);

      const result = await resolveScope(env.productDir, { walkRoot: env.productDir }, resolverConfig);

      // collectPaths skips artifact directories during the walk; artifact files never enter included
      const artifactInIncluded = result.included.find((e) => e.path === artifactFilePath);
      expect(artifactInIncluded, `file-inclusion.scenario: ${artifactFilePath} absent from scope.included`)
        .toBeUndefined();

      const hidden = result.excluded.find((e) => e.path === hiddenFilePath);
      expect(hidden, `scope.excluded missing entry for "${hiddenFilePath}"`).toBeDefined();
      expect(hidden!.decisionTrail.some((d) => d.layer === HIDDEN_PREFIX_LAYER)).toBe(true);

      const ignored = result.excluded.find((e) => e.path === ignoredFilePath);
      expect(ignored, `scope.excluded missing entry for "${ignoredFilePath}"`).toBeDefined();
      expect(ignored!.decisionTrail.some((d) => d.layer === IGNORE_SOURCE_LAYER)).toBe(true);

      const clean = result.included.find((e) => e.path === cleanFilePath);
      expect(clean, `scope.included missing entry for "${cleanFilePath}"`).toBeDefined();
    });
  });

  it("tool arguments reference only the resolved excluded set in the tool's native flag syntax", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);

      const result = await resolveScope(env.productDir, { walkRoot: env.productDir }, resolverConfig);

      const toolFlag = TOOL_DEFAULT_FLAGS[testTool];
      const adapterConfig: ToolAdaptersConfig = { [testTool]: { ignoreFlag: toolFlag } };
      const args = toToolArguments(result, testTool, adapterConfig);

      const excludedPaths = new Set(result.excluded.map((e) => e.path));
      const outputPaths = new Set<string>();
      for (let i = 0; i < args.length; i++) {
        if (args[i] === toolFlag) {
          const path = args[i + 1];
          if (path !== undefined) {
            outputPaths.add(path);
          }
        }
      }

      for (const path of outputPaths) {
        expect(excludedPaths.has(path), `"${path}" in args must be in excluded set`).toBe(true);
      }
      for (const path of excludedPaths) {
        expect(outputPaths.has(path), `"${path}" from excluded must appear in args`).toBe(true);
      }
    });
  });

  it("file-inclusion scope and tool values resolve through the config descriptor", async () => {
    const generated = sampleConfigValue(CONFIG_GENERATOR.fileInclusionOverride());

    await withTestEnv(generated.config, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[FILE_INCLUSION_SECTION]).toEqual(generated.expected);
      }
    });
  });

  it("file-inclusion tool overrides default missing adapter fields from the registered tool", async () => {
    const generated = sampleConfigValue(CONFIG_GENERATOR.fileInclusionPartialToolOverride());

    await withTestEnv(generated.config, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[FILE_INCLUSION_SECTION]).toEqual(generated.expected);
      }
    });
  });

  it("file-inclusion rejects unknown tool override names", async () => {
    const generated = sampleConfigValue(CONFIG_GENERATOR.fileInclusionUnknownToolOverride());

    await withTestEnv(generated.config, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(generated.toolName);
      }
    });
  });

  it("file-inclusion rejects an explicit null value for the scope section", async () => {
    await withTestEnv({ [FILE_INCLUSION_SECTION]: { scope: null } }, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`${FILE_INCLUSION_SECTION}.scope`);
      }
    });
  });

  it("file-inclusion rejects an explicit null value for the tools section", async () => {
    await withTestEnv({ [FILE_INCLUSION_SECTION]: { tools: null } }, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`${FILE_INCLUSION_SECTION}.tools`);
      }
    });
  });
});
