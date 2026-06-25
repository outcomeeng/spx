import { describe } from "vitest";

import rule, { NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_NAME } from "@eslint-rules/no-process-cwd-for-product-roots";
import { noProcessCwdForProductRootsCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("process cwd product-root rule", () => {
  runValidationRuleTester({
    ruleName: NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_NAME,
    rule,
    cases: noProcessCwdForProductRootsCases(),
  });
});
