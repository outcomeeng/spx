import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";

type AstNode = {
  readonly type?: string;
  readonly types?: readonly AstNode[];
  readonly literal?: {
    readonly value?: unknown;
  };
};

export const NO_BARE_STRING_UNIONS_RULE_NAME = "no-bare-string-unions";
export const NO_BARE_STRING_UNIONS_RULE_ID = `${SPX_RULE_PREFIX}${NO_BARE_STRING_UNIONS_RULE_NAME}` as const;
export const BARE_STRING_UNION_MESSAGE_ID = "bareStringUnion";

const MIN_UNION_MEMBERS = 2;

function isStringLiteralType(node: AstNode): boolean {
  return node.type === "TSLiteralType" && typeof node.literal?.value === "string";
}

function isBareStringUnion(node: AstNode): boolean {
  return (
    node.type === "TSUnionType"
    && Array.isArray(node.types)
    && node.types.length >= MIN_UNION_MEMBERS
    && node.types.every(isStringLiteralType)
  );
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hand-maintained string literal unions for closed sets",
    },
    messages: {
      [BARE_STRING_UNION_MESSAGE_ID]:
        "Bare string-literal unions are banned. Declare a source-owned `as const` registry and derive the union type from that registry.",
    },
  },

  create(context) {
    return {
      TSUnionType(node: AstNode) {
        if (!isBareStringUnion(node)) return;
        context.report({
          node: node as never,
          messageId: BARE_STRING_UNION_MESSAGE_ID,
        });
      },
    };
  },
};

export default rule;
