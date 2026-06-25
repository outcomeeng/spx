import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";

export const NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_NAME = "no-process-cwd-for-product-roots";
export const NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_NAME}` as const;
export const PROCESS_CWD_FOR_PRODUCT_ROOT_MESSAGE_ID = "processCwdForProductRoot";

const CONFIG_CWD_MODULE_PATH = "src/domains/config/cwd.ts";
const PROCESS_IDENTIFIER_PATTERN = /^process$/u;

type AstNode = {
  readonly type?: string;
  readonly callee?: {
    readonly type?: string;
    readonly object?: {
      readonly type?: string;
      readonly name?: string;
    };
    readonly property?: {
      readonly type?: string;
      readonly name?: string;
    };
  };
};

function isProcessCwdCall(node: AstNode): boolean {
  return (
    node.callee?.type === "MemberExpression"
    && node.callee.object?.type === "Identifier"
    && typeof node.callee.object.name === "string"
    && PROCESS_IDENTIFIER_PATTERN.test(node.callee.object.name)
    && node.callee.property?.type === "Identifier"
    && node.callee.property.name === "cwd"
  );
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid direct process.cwd() reads outside the config-owned cwd boundary",
    },
    messages: {
      [PROCESS_CWD_FOR_PRODUCT_ROOT_MESSAGE_ID]:
        "Do not read process.cwd() directly for product roots. Use CONFIG_PROCESS_CWD from @/domains/config/cwd or pass an explicit config-owned product context.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const filename = context.filename ?? context.getFilename();
    if (filename.endsWith(CONFIG_CWD_MODULE_PATH)) {
      return {};
    }

    return {
      CallExpression(node: unknown) {
        if (typeof node !== "object" || node === null) return;
        if (!isProcessCwdCall(node as AstNode)) return;

        context.report({
          node: node as never,
          messageId: PROCESS_CWD_FOR_PRODUCT_ROOT_MESSAGE_ID,
        });
      },
    };
  },
};

export default rule;
