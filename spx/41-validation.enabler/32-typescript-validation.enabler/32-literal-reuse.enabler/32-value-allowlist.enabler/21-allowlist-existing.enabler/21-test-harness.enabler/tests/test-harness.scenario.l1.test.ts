import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_FILE_FORMAT } from "@/config/index";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  buildBaselineConfig,
  buildConfigWithAllowlist,
  readLiteralAllowlist,
  readProductConfigSections,
  writeDuplicatedLiteralFixture,
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

  it("writeDuplicatedLiteralFixture materializes a source fixture carrying the literal", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());

    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);

      const sourceDir = join(env.productDir, dirname(sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath())));
      const contents = await Promise.all(
        (await readdir(sourceDir)).map((name) => readFile(join(sourceDir, name))),
      );

      expect(contents.some((content) => content.includes(literal))).toBe(true);
    });
  });
});
