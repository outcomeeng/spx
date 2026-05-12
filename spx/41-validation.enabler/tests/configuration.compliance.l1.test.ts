import { describe, expect, it } from "vitest";

import { knipCommand } from "@/commands/validation/knip";
import { LITERAL_DISABLED_MESSAGE, literalCommand } from "@/commands/validation/literal";
import { VALIDATION_COMMAND_OUTPUT } from "@/commands/validation/messages";
import { resolveConfig } from "@/config/index";
import {
  VALIDATION_ENABLED_FIELD,
  VALIDATION_KNIP_SUBSECTION,
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  VALIDATION_PATHS_SUBSECTION,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { type Config } from "@testing/harnesses/spec-tree/spec-tree";

function validationConfigSection(section: string, enabled: boolean): Config {
  return {
    [validationConfigDescriptor.section]: {
      [section]: {
        [VALIDATION_ENABLED_FIELD]: enabled,
      },
    },
  };
}

describe("ALWAYS: validation command participation is driven by spx config", () => {
  it("resolves literal enabled and knip disabled from descriptor defaults", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const resolved = await resolveConfig(env.projectDir, [validationConfigDescriptor]);

      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        const validationConfig = resolved.value[validationConfigDescriptor.section] as ValidationConfig;
        expect(validationConfig.literal.enabled).toBe(true);
        expect(validationConfig.knip.enabled).toBe(false);
      }
    });
  });

  it("skips literal validation when validation.literal.enabled is false", async () => {
    await withLiteralFixtureEnv(
      validationConfigSection(VALIDATION_LITERAL_SUBSECTION, false),
      async (env) => {
        await env.writeTsConfigMarker();

        const result = await literalCommand({ cwd: env.projectDir });

        expect(result.exitCode).toBe(0);
        expect(result.output).toBe(LITERAL_DISABLED_MESSAGE);
      },
    );
  });

  it("skips knip validation when validation.knip.enabled is false", async () => {
    await withLiteralFixtureEnv(
      validationConfigSection(VALIDATION_KNIP_SUBSECTION, false),
      async (env) => {
        const result = await knipCommand({ cwd: env.projectDir });

        expect(result.exitCode).toBe(0);
        expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED);
      },
    );
  });

  it("resolves per-tool validation path configuration through the descriptor", async () => {
    await withLiteralFixtureEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.ESLINT]: {
              include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            },
          },
        },
      },
      async (env) => {
        const resolved = await resolveConfig(env.projectDir, [validationConfigDescriptor]);

        expect(resolved.ok).toBe(true);
        if (resolved.ok) {
          const validationConfig = resolved.value[validationConfigDescriptor.section] as ValidationConfig;
          expect(validationConfig.paths.eslint?.include).toEqual([VALIDATION_PIPELINE_DATA.sourceDirectoryName]);
          expect(validationConfig.paths.knip).toBeUndefined();
        }
      },
    );
  });
});
