/**
 * ESLint Rule: No Hardcoded Spec Tree Node Kinds
 *
 * Detects source-owned spec-tree node kind strings in test files and directs
 * authors to the NODE_KINDS registry.
 */

import type { Rule } from "eslint";

import { NODE_KINDS } from "../src/lib/spec-tree";
import { SPX_RULE_PREFIX } from "./import-source";
import {
  isInTestDescription,
  isInTypeDefinition,
  isObjectKey,
  isStringLiteralNode,
  isTestFile,
} from "./test-literal-context";

export const NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_NAME = "no-hardcoded-spec-tree-node-kinds";
export const NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_NAME}` as const;
export const USE_SPEC_TREE_NODE_KINDS_MESSAGE_ID = "useSpecTreeNodeKinds";

const SPEC_TREE_NODE_KIND_VALUES: ReadonlySet<string> = new Set(NODE_KINDS);

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce source-owned NODE_KINDS registry references instead of hardcoded exact node kind string literals in test assertions",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      [USE_SPEC_TREE_NODE_KINDS_MESSAGE_ID]:
        "Do not hardcode source-owned spec-tree node kind '{{value}}'. Import NODE_KINDS from '@/lib/spec-tree' and reference that registry.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    if (!isTestFile(context)) {
      return {};
    }

    return {
      Literal(node) {
        if (!isStringLiteralNode(node)) return;
        if (!SPEC_TREE_NODE_KIND_VALUES.has(node.value)) return;
        if (isInTestDescription(node)) return;
        if (isInTypeDefinition(node)) return;
        if (isObjectKey(node)) return;

        context.report({
          node: node as Rule.Node,
          messageId: USE_SPEC_TREE_NODE_KINDS_MESSAGE_ID,
          data: { value: node.value },
        });
      },
    };
  },
};

export default rule;
