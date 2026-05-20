import { describe } from "vitest";

import rule, {
  NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME,
} from "@eslint-rules/no-hardcoded-session-frontmatter-keys";
import { noHardcodedSessionFrontmatterKeysCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("hardcoded session frontmatter key rule", () => {
  runValidationRuleTester({
    ruleName: NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME,
    rule,
    cases: noHardcodedSessionFrontmatterKeysCases(),
  });
});
