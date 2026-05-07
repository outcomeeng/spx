/**
 * ESLint Rule: No Hardcoded Work Item Kinds
 *
 * Detects source-owned work item kind strings ("capability", "feature", "story")
 * in test files and directs authors to the WORK_ITEM_KINDS registry.
 */

import type { Rule } from "eslint";

import { WORK_ITEM_KINDS } from "../src/lib/spec-legacy/types";
import { SPX_RULE_PREFIX } from "./import-source";

import {
  isInTestDescription,
  isInTypeDefinition,
  isObjectKey,
  isStringLiteralNode,
  isTestFile,
} from "./test-literal-context";

export const NO_HARDCODED_WORK_ITEM_KINDS_RULE_NAME = "no-hardcoded-work-item-kinds";
export const NO_HARDCODED_WORK_ITEM_KINDS_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_HARDCODED_WORK_ITEM_KINDS_RULE_NAME}` as const;
export const USE_WORK_ITEM_KINDS_MESSAGE_ID = "useWorkItemKinds";

const WORK_ITEM_KIND_VALUES: ReadonlySet<string> = new Set(WORK_ITEM_KINDS);

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce source-owned WORK_ITEM_KINDS registry references instead of hardcoded kind strings",
      category: "Best Practices",
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      [USE_WORK_ITEM_KINDS_MESSAGE_ID]:
        "Do not hardcode source-owned work item kind '{{value}}'. Import WORK_ITEM_KINDS from '@/types' and reference that registry.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    if (!isTestFile(context)) {
      return {};
    }

    return {
      Literal(node) {
        if (!isStringLiteralNode(node)) return;
        if (!WORK_ITEM_KIND_VALUES.has(node.value)) return;
        if (isInTestDescription(node)) return;
        if (isInTypeDefinition(node)) return;
        if (isObjectKey(node)) return;

        context.report({
          node: node as never,
          messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID,
          data: { value: node.value },
        });
      },
    };
  },
};

export default rule;
