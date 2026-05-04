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
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("value-allowlist — scenarios", () => {
  it("validation.literal.values.include containing a value suppresses all findings for that value", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const allowedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
      const reportedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeSourceFile("src/source-a.ts", allowedLiteral);
      await env.writeSourceFile("src/source-b.ts", reportedLiteral);
      await env.writeTestFile("tests/test-a.test.ts", allowedLiteral);
      await env.writeTestFile("tests/test-b.test.ts", reportedLiteral);

      const config = { ...LITERAL_DEFAULTS, allowlist: { include: [allowedLiteral] } };
      const result = await validateLiteralReuse({ projectRoot: env.projectDir, config });

      expect(result.findings.srcReuse.some((f) => f.value === allowedLiteral)).toBe(false);
      expect(result.findings.srcReuse.some((f) => f.value === reportedLiteral)).toBe(true);
    });
  });

  it("validation.literal.values.presets naming the web preset suppresses all bundled tokens", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

      await env.writeSourceFile("src/api.ts", webToken);
      await env.writeTestFile("tests/api.test.ts", webToken);

      const config = buildLiteralConfig({
        allowlist: { presets: [PRESET_NAMES.WEB] },
        minStringLength: 0,
      });
      const result = await validateLiteralReuse({ projectRoot: env.projectDir, config });

      expect(result.findings.srcReuse.some((f) => f.value === webToken)).toBe(false);
    });
  });

  it("validation.literal.values.exclude naming a preset-supplied value keeps reporting problems for that value", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

      await env.writeSourceFile("src/api.ts", webToken);
      await env.writeTestFile("tests/api.test.ts", webToken);

      const config = buildLiteralConfig({
        allowlist: { presets: [PRESET_NAMES.WEB], exclude: [webToken] },
        minStringLength: 0,
      });
      const result = await validateLiteralReuse({ projectRoot: env.projectDir, config });

      expect(result.findings.srcReuse.some((f) => f.value === webToken)).toBe(true);
    });
  });

  it("no spx.config.* file at the project root yields an empty effective allowlist and all findings are reported", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const literal = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeSourceFile("src/source.ts", literal);
      await env.writeTestFile("tests/test.test.ts", literal);

      const result = await validateLiteralReuse({ projectRoot: env.projectDir });

      expect(result.findings.srcReuse.some((f) => f.value === literal)).toBe(true);
    });
  });

  it("unrecognized preset identifier in validation.literal.values.presets causes resolveConfig to return an error naming the identifier", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
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
