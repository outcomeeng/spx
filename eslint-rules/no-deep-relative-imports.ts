import type { Rule } from "eslint";

import { type AstNode, getModuleSource, SPX_RULE_PREFIX } from "./import-source";

const DEEP_PARENT_IMPORT = /^\.\.\/\.\.(?:\/|$)/;

export const NO_DEEP_RELATIVE_IMPORTS_RULE_NAME = "no-deep-relative-imports";
export const NO_DEEP_RELATIVE_IMPORTS_RULE_ID = `${SPX_RULE_PREFIX}${NO_DEEP_RELATIVE_IMPORTS_RULE_NAME}` as const;
export const DEEP_RELATIVE_IMPORT_MESSAGE_ID = "deepRelativeImport";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow relative imports that climb more than one parent directory",
    },
    messages: {
      [DEEP_RELATIVE_IMPORT_MESSAGE_ID]:
        "Relative import '{{source}}' climbs more than one parent directory. Use a configured alias or a local module boundary.",
    },
  },

  create(context) {
    function check(node: AstNode): void {
      const moduleSource = getModuleSource(node);
      if (!moduleSource) return;
      if (!DEEP_PARENT_IMPORT.test(moduleSource.value)) return;

      context.report({
        node: moduleSource.node as never,
        messageId: DEEP_RELATIVE_IMPORT_MESSAGE_ID,
        data: { source: moduleSource.value },
      });
    }

    return {
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      ImportDeclaration: check,
      ImportExpression: check,
      TSImportType: check,
    };
  },
};

export default rule;
