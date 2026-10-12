/**
 * ESLint Rule: No Hardcoded Spec Tree Node States
 *
 * Detects source-owned spec-tree node state strings in test files and directs
 * authors to the SPEC_TREE_NODE_STATE registry.
 */

import type { Rule } from "eslint";

import { SPEC_TREE_NODE_STATE } from "../src/lib/spec-tree";
import { SPX_RULE_PREFIX } from "./import-source";
import {
  isInTestDescription,
  isInTypeDefinition,
  isObjectKey,
  isStringLiteralNode,
  isTestFile,
} from "./test-literal-context";

export const NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_NAME = "no-hardcoded-spec-tree-node-states";
export const NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_NAME}` as const;
export const USE_SPEC_TREE_NODE_STATES_MESSAGE_ID = "useSpecTreeNodeStates";

const SPEC_TREE_NODE_STATE_VALUES: ReadonlySet<string> = new Set(Object.values(SPEC_TREE_NODE_STATE));

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce source-owned SPEC_TREE_NODE_STATE registry references instead of hardcoded exact node state string literals in test assertions",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      [USE_SPEC_TREE_NODE_STATES_MESSAGE_ID]:
        "Do not hardcode source-owned spec-tree node state '{{value}}'. Import SPEC_TREE_NODE_STATE from '@/lib/spec-tree' and reference that registry.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    if (!isTestFile(context)) {
      return {};
    }

    return {
      Literal(node) {
        if (!isStringLiteralNode(node)) return;
        if (!SPEC_TREE_NODE_STATE_VALUES.has(node.value)) return;
        if (isInTestDescription(node)) return;
        if (isInTypeDefinition(node)) return;
        if (isObjectKey(node)) return;

        context.report({
          node: node as Rule.Node,
          messageId: USE_SPEC_TREE_NODE_STATES_MESSAGE_ID,
          data: { value: node.value },
        });
      },
    };
  },
};

export default rule;
