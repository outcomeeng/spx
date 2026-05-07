/**
 * ESLint Rule: No Hardcoded Statuses
 *
 * Detects source-owned work item status strings ("OPEN", "IN_PROGRESS", "DONE")
 * in test files and directs authors to the WORK_ITEM_STATUSES registry.
 *
 * Exact match only: "DONE.md" does not trigger, only "DONE".
 */

import type { Rule } from "eslint";

import { WORK_ITEM_STATUSES } from "../src/lib/spec-legacy/types";

import {
  isInTestDescription,
  isInTypeDefinition,
  isObjectKey,
  isStringLiteralNode,
  isTestFile,
} from "./test-literal-context";

import { SPX_RULE_PREFIX } from "./import-source";

export const NO_HARDCODED_STATUSES_RULE_NAME = "no-hardcoded-statuses";
export const NO_HARDCODED_STATUSES_RULE_ID = `${SPX_RULE_PREFIX}${NO_HARDCODED_STATUSES_RULE_NAME}` as const;
export const USE_WORK_ITEM_STATUSES_MESSAGE_ID = "useWorkItemStatuses";

const WORK_ITEM_STATUS_VALUES: ReadonlySet<string> = new Set(WORK_ITEM_STATUSES);

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce source-owned WORK_ITEM_STATUSES registry references instead of hardcoded status strings",
      category: "Best Practices",
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      [USE_WORK_ITEM_STATUSES_MESSAGE_ID]:
        "Do not hardcode source-owned status '{{value}}'. Import WORK_ITEM_STATUSES from '@/types' and reference that registry.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    if (!isTestFile(context)) {
      return {};
    }

    return {
      Literal(node) {
        if (!isStringLiteralNode(node)) return;
        if (!WORK_ITEM_STATUS_VALUES.has(node.value)) return;
        if (isInTestDescription(node)) return;
        if (isInTypeDefinition(node)) return;
        if (isObjectKey(node)) return;

        context.report({
          node: node as never,
          messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID,
          data: { value: node.value },
        });
      },
    };
  },
};

export default rule;
