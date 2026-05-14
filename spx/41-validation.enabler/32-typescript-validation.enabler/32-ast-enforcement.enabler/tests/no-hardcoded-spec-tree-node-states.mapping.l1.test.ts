import { describe } from "vitest";

import rule, { NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_NAME } from "@eslint-rules/no-hardcoded-spec-tree-node-states";
import { noHardcodedSpecTreeNodeStatesCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("hardcoded spec-tree node state rule", () => {
  runValidationRuleTester({
    ruleName: NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_NAME,
    rule,
    cases: noHardcodedSpecTreeNodeStatesCases(),
  });
});
