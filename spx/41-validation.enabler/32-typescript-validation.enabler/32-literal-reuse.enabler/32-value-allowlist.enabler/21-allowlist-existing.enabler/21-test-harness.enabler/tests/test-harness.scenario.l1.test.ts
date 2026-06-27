import { describe, expect, it } from "vitest";

import { CONFIG_FILE_FORMAT } from "@/config/index";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  buildBaselineConfig,
  buildConfigWithAllowlist,
  buildConfigWithValidationPaths,
  readLiteralAllowlist,
  readProductConfigSections,
  writeProjectConfig,
} from "@testing/harnesses/literal-reuse/allowlist-existing";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("allowlist-existing test harness — scenarios", () => {
  it("writeProjectConfig and readProductConfigSections round-trip the allowlist section", async () => {
    const include = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];
    const config = buildConfigWithAllowlist({ include });

    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeProjectConfig(env, CONFIG_FILE_FORMAT.TOML, config);

      expect(readLiteralAllowlist(await readProductConfigSections(env)).include).toEqual(include);
    });
  });

  it("buildConfigWithValidationPaths nests validation path config beside literal values", () => {
    const excludedPathPrefix = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const include = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];

    const config = buildConfigWithValidationPaths(
      { exclude: [excludedPathPrefix] },
      { include },
    );
    const validation = config.validation as {
      readonly paths: { readonly exclude: readonly string[] };
    };

    expect(validation.paths.exclude).toEqual([excludedPathPrefix]);
    expect(readLiteralAllowlist(config).include).toEqual(include);
  });
});
