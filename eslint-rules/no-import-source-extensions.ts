import type { Rule } from "eslint";

import {
  type AstNode,
  getModuleSource,
  getSourceTextQuote,
  isInternalModuleSource,
  SPX_RULE_PREFIX,
} from "./import-source";

const BANNED_SOURCE_EXTENSION = /\.(?:d\.)?(?:cjs|mjs|js|jsx|cts|mts|ts|tsx)(?=$|[?#])/;

export const NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME = "no-import-source-extensions";
export const NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME}` as const;
export const IMPORT_SOURCE_EXTENSION_MESSAGE_ID = "importSourceExtension";

function stripExtension(value: string): string {
  return value.replace(BANNED_SOURCE_EXTENSION, "");
}

function getExtension(value: string): string {
  return value.match(BANNED_SOURCE_EXTENSION)?.[0] ?? "";
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description: "Disallow file extensions on internal TypeScript module specifiers",
    },
    messages: {
      [IMPORT_SOURCE_EXTENSION_MESSAGE_ID]:
        "Internal import '{{source}}' includes '{{extension}}'. Use an extensionless internal module specifier.",
    },
  },

  create(context) {
    function check(node: AstNode): void {
      const moduleSource = getModuleSource(node);
      if (!moduleSource) return;
      if (!isInternalModuleSource(moduleSource.value)) return;
      if (!BANNED_SOURCE_EXTENSION.test(moduleSource.value)) return;

      const fixedValue = stripExtension(moduleSource.value);
      const quote = getSourceTextQuote(context.sourceCode, moduleSource.node);

      context.report({
        node: moduleSource.node as never,
        messageId: IMPORT_SOURCE_EXTENSION_MESSAGE_ID,
        data: {
          extension: getExtension(moduleSource.value),
          source: moduleSource.value,
        },
        fix(fixer) {
          return fixer.replaceText(moduleSource.node as never, `${quote}${fixedValue}${quote}`);
        },
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
