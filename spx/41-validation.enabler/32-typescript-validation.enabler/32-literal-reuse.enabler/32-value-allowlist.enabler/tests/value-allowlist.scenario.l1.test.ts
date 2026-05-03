import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME, resolveConfig } from "@/config/index";
import { validationConfigDescriptor } from "@/validation/config/descriptor";
import { LITERAL_DEFAULTS, PRESET_NAMES } from "@/validation/literal/config";
import { validateLiteralReuse } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  buildLiteralConfig,
  LITERAL_TEST_GENERATOR,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("value-allowlist — scenarios", () => {
  it("validation.literal.values.include containing a value suppresses all findings for that value", async () => {
    await withTestEnv({}, async (env) => {
      const allowedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
      const reportedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeRaw(
        "src/source.ts",
        `export const A = "${allowedLiteral}"; export const B = "${reportedLiteral}";\n`,
      );
      await env.writeRaw(
        "tests/test.test.ts",
        `expect(v).toBe("${allowedLiteral}"); expect(w).toBe("${reportedLiteral}");\n`,
      );

      const config = { ...LITERAL_DEFAULTS, allowlist: { include: [allowedLiteral] } };
      const result = await validateLiteralReuse({ projectRoot: env.projectDir, config });

      expect(result.findings.srcReuse.some((f) => f.value === allowedLiteral)).toBe(false);
      expect(result.findings.srcReuse.some((f) => f.value === reportedLiteral)).toBe(true);
    });
  });

  it("validation.literal.values.presets naming the web preset suppresses all bundled tokens", async () => {
    await withTestEnv({}, async (env) => {
      const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

      await env.writeRaw("src/api.ts", `export const TOKEN = "${webToken}";\n`);
      await env.writeRaw("tests/api.test.ts", `expect(v).toBe("${webToken}");\n`);

      const config = buildLiteralConfig({
        allowlist: { presets: [PRESET_NAMES.WEB] },
        minStringLength: 0,
      });
      const result = await validateLiteralReuse({ projectRoot: env.projectDir, config });

      expect(result.findings.srcReuse.some((f) => f.value === webToken)).toBe(false);
    });
  });

  it("validation.literal.values.exclude naming a preset-supplied value keeps reporting problems for that value", async () => {
    await withTestEnv({}, async (env) => {
      const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

      await env.writeRaw("src/api.ts", `export const TOKEN = "${webToken}";\n`);
      await env.writeRaw("tests/api.test.ts", `expect(v).toBe("${webToken}");\n`);

      const config = buildLiteralConfig({
        allowlist: { presets: [PRESET_NAMES.WEB], exclude: [webToken] },
        minStringLength: 0,
      });
      const result = await validateLiteralReuse({ projectRoot: env.projectDir, config });

      expect(result.findings.srcReuse.some((f) => f.value === webToken)).toBe(true);
    });
  });

  it("no spx.config.* file at the project root yields an empty effective allowlist and all findings are reported", async () => {
    await withTestEnv({}, async (env) => {
      const literal = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeRaw("src/source.ts", `export const V = "${literal}";\n`);
      await env.writeRaw("tests/test.test.ts", `expect(v).toBe("${literal}");\n`);

      const result = await validateLiteralReuse({ projectRoot: env.projectDir });

      expect(result.findings.srcReuse.some((f) => f.value === literal)).toBe(true);
    });
  });

  it("unrecognized preset identifier in validation.literal.values.presets causes resolveConfig to return an error naming the identifier", async () => {
    await withTestEnv({}, async (env) => {
      const badPreset = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeRaw(
        DEFAULT_CONFIG_FILENAME,
        `validation:\n  literal:\n    values:\n      allowlist:\n        presets:\n          - ${badPreset}\n`,
      );

      const resolved = await resolveConfig(env.projectDir, [validationConfigDescriptor]);

      expect(resolved.ok).toBe(false);
      if (!resolved.ok) {
        expect(resolved.error).toContain(badPreset);
      }
    });
  });
});
