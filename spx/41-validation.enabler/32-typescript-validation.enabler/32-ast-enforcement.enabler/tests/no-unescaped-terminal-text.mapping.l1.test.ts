import { describe } from "vitest";

import rule, { NO_UNESCAPED_TERMINAL_TEXT_RULE_NAME } from "@eslint-rules/no-unescaped-terminal-text";
import { noUnescapedTerminalTextCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("unescaped terminal text rule", () => {
  runValidationRuleTester({
    ruleName: NO_UNESCAPED_TERMINAL_TEXT_RULE_NAME,
    rule,
    cases: noUnescapedTerminalTextCases(),
  });
});
