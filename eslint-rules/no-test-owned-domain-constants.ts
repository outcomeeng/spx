import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";
import { isTestFile } from "./test-literal-context";

export const NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME = "no-test-owned-domain-constants";
export const NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME}` as const;
export const TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID = "testOwnedDomainConstant";
export const TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID = "testOwnedDomainRegistry";

const UPPERCASE_CONSTANT_PATTERN = /^[A-Z][A-Z0-9_]*$/;

type AstNode = {
  readonly type?: string;
  readonly parent?: AstNode | null;
  readonly id?: AstNode;
  readonly init?: AstNode | null;
  readonly name?: string;
  readonly expression?: AstNode;
  readonly typeAnnotation?: AstNode;
  readonly typeName?: AstNode;
};

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow top-level uppercase test constants and test-owned as const registries",
    },
    messages: {
      [TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID]:
        "Do not define top-level uppercase test constant '{{name}}'. Import the source-owned value or generate test data from a generator.",
      [TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID]:
        "Do not define test-owned `as const` registry '{{name}}'. Move the semantic set to source ownership or generate test inputs.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    if (!isTestFile(context)) {
      return {};
    }

    return {
      VariableDeclarator(node: unknown) {
        if (!isAstNode(node)) return;
        if (!isTopLevelVariableDeclarator(node)) return;
        if (!isIdentifier(node.id)) return;

        const name = node.id.name;
        if (isConstRegistry(node.init)) {
          context.report({
            node: node as never,
            messageId: TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID,
            data: { name },
          });
          return;
        }

        if (!UPPERCASE_CONSTANT_PATTERN.test(name)) return;
        context.report({
          node: node.id as never,
          messageId: TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID,
          data: { name },
        });
      },
    };
  },
};

function isAstNode(node: unknown): node is AstNode {
  return typeof node === "object" && node !== null;
}

function isIdentifier(node: AstNode | undefined): node is AstNode & { readonly name: string } {
  return node?.type === "Identifier" && typeof node.name === "string";
}

function isTopLevelVariableDeclarator(node: AstNode): boolean {
  const declaration = node.parent;
  if (declaration?.type !== "VariableDeclaration") return false;

  const parent = declaration.parent;
  if (parent?.type === "Program") return true;
  return parent?.type === "ExportNamedDeclaration" && parent.parent?.type === "Program";
}

function isConstRegistry(node: AstNode | null | undefined): boolean {
  if (node?.type !== "TSAsExpression") return false;
  if (!isConstAssertion(node.typeAnnotation)) return false;
  return node.expression?.type === "ObjectExpression" || node.expression?.type === "ArrayExpression";
}

function isConstAssertion(node: AstNode | undefined): boolean {
  // Current parser versions use TSTypeReference for `as const`; keep
  // TSConstKeyword for parser releases that expose keyword assertions directly.
  if (node?.type === "TSConstKeyword") return true;
  return node?.type === "TSTypeReference" && node.typeName?.type === "Identifier" && node.typeName.name === "const";
}

export default rule;
