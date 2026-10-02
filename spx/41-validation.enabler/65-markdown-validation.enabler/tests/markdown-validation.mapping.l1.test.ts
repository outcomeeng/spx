import { describe, expect, it } from "vitest";

import { compareAsciiStrings } from "@/lib/state-store";
import { MARKDOWN_VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/markdown";
import { VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/types";
import {
  buildMarkdownlintConfig,
  MARKDOWN_CONFIG_CONTROL_KEYS,
  MARKDOWN_DEFAULT_DIRECTORY_NAMES,
  MARKDOWN_ENABLED_BUILTIN_RULES,
} from "@/validation/steps/markdown";

describe("Enabled built-in markdownlint rules", () => {
  it("map every default directory to the curated rule set with all other built-in rules disabled", () => {
    for (const directoryName of MARKDOWN_DEFAULT_DIRECTORY_NAMES) {
      const config = buildMarkdownlintConfig(directoryName);

      expect(config).toMatchObject({
        [MARKDOWN_CONFIG_CONTROL_KEYS.DEFAULT]: false,
        ...MARKDOWN_ENABLED_BUILTIN_RULES,
      });
      expect(Object.keys(config).sort(compareAsciiStrings)).toEqual(
        [...Object.keys(MARKDOWN_ENABLED_BUILTIN_RULES), ...Object.values(MARKDOWN_CONFIG_CONTROL_KEYS)].sort(
          compareAsciiStrings,
        ),
      );
    }
  });

  it("maps MD024 to siblings_only for spx/ and to disabled for docs/", () => {
    const [specTreeDirectory, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;

    expect(buildMarkdownlintConfig(specTreeDirectory)[MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS]).toEqual({
      siblings_only: true,
    });
    expect(buildMarkdownlintConfig(docsDirectory)[MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS]).toBe(false);
  });
});

describe("Markdown full-pipeline participation", () => {
  it("maps to run by default", () => {
    expect(Object.values(MARKDOWN_VALIDATION_STAGE_PARTICIPATION).map((policy) => policy.default)).toEqual([
      VALIDATION_STAGE_PARTICIPATION.RUN,
    ]);
  });
});
