import { describe, expect, it } from "vitest";

import { buildEslintArgs, DEFAULT_ESLINT_CONFIG_FILE, ESLINT_COMMAND_TOKENS } from "@/validation/steps/eslint";
import { EXECUTION_MODES } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";

describe("ESLint command arguments", () => {
  it("passes project lint through without injected policy arguments", () => {
    const args = buildEslintArgs({});

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("passes scoped file lint through without injected policy arguments", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const args = buildEslintArgs({
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("passes fix mode through as the only optional ESLint behavior flag", () => {
    const args = buildEslintArgs({
      mode: EXECUTION_MODES.WRITE,
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FIX_FLAG,
    ]);
  });
});
