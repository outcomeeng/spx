import { describe } from "vitest";

import rule, { NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_NAME } from "@eslint-rules/no-hardcoded-spec-tree-node-kinds";
import { noHardcodedSpecTreeNodeKindsCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("hardcoded spec-tree node kind rule", () => {
  runValidationRuleTester({
    ruleName: NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_NAME,
    rule,
    cases: noHardcodedSpecTreeNodeKindsCases(),
  });
});
