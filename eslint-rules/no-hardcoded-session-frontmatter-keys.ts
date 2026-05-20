/**
 * ESLint Rule: No Hardcoded Session Frontmatter Keys
 *
 * Detects session frontmatter key string literals outside the schema module.
 */

import type { Rule } from "eslint";

import { SESSION_FRONT_MATTER } from "../src/domains/session/types";
import { SPX_RULE_PREFIX } from "./import-source";
import { isInTestDescription, isInTypeDefinition, isStringLiteralNode } from "./test-literal-context";

export const NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME = "no-hardcoded-session-frontmatter-keys";
export const NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME}` as const;
export const USE_SESSION_FRONTMATTER_MESSAGE_ID = "useSessionFrontmatter";

const SESSION_FRONTMATTER_KEY_VALUES: ReadonlySet<string> = new Set(Object.values(SESSION_FRONT_MATTER));
const SESSION_FRONTMATTER_DEFINITION_FILE = "src/domains/session/types.ts";

function isSessionFrontmatterDefinitionFile(context: Rule.RuleContext): boolean {
  const filename = context.filename ?? context.getFilename();
  return filename.endsWith(SESSION_FRONTMATTER_DEFINITION_FILE);
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce SESSION_FRONT_MATTER registry references instead of hardcoded session frontmatter key string literals",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      [USE_SESSION_FRONTMATTER_MESSAGE_ID]:
        "Do not hardcode session frontmatter key '{{value}}'. Import SESSION_FRONT_MATTER from '@/domains/session/types' and reference that registry.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    if (isSessionFrontmatterDefinitionFile(context)) {
      return {};
    }

    return {
      Literal(node) {
        if (!isStringLiteralNode(node)) return;
        if (!SESSION_FRONTMATTER_KEY_VALUES.has(node.value)) return;
        if (isInTestDescription(node)) return;
        if (isInTypeDefinition(node)) return;

        context.report({
          node: node as Rule.Node,
          messageId: USE_SESSION_FRONTMATTER_MESSAGE_ID,
          data: { value: node.value },
        });
      },
    };
  },
};

export default rule;
