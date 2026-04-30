import type { Rule } from "eslint";

const TEST_FUNCTION_NAMES = new Set(["describe", "it", "test"]);

type NamedCallee = {
  readonly type?: string;
  readonly name?: string;
  readonly callee?: NamedCallee;
  readonly object?: NamedCallee;
  readonly property?: NamedCallee;
};

type AstNode = {
  readonly type?: string;
  readonly parent?: AstNode;
  readonly callee?: NamedCallee;
  readonly arguments?: readonly unknown[];
  readonly key?: unknown;
  readonly value?: unknown;
};

export type StringLiteralNode = AstNode & {
  readonly value: string;
};

export function isStringLiteralNode(node: unknown): node is StringLiteralNode {
  return isAstNode(node) && typeof node.value === "string";
}

export function isTestFile(context: Rule.RuleContext): boolean {
  const filename = context.filename ?? context.getFilename();
  return (
    filename.includes(".test.")
    || filename.includes(".spec.")
    || filename.includes("/tests/")
    || filename.includes("/__tests__/")
    || filename.startsWith("tests/")
    || filename.startsWith("__tests__/")
  );
}

export function isInTestDescription(node: unknown): boolean {
  const original = node;
  let parent = getParent(node);

  while (parent) {
    if (isTestCall(parent) && parent.arguments?.[0] === original) {
      return true;
    }

    if (parent.type === "TemplateLiteral") {
      const call = getParent(parent);
      if (call && isTestCall(call) && call.arguments?.[0] === parent) {
        return true;
      }
    }

    parent = getParent(parent);
  }

  return false;
}

export function isInTypeDefinition(node: unknown): boolean {
  let parent = getParent(node);

  while (parent) {
    if (
      parent.type === "TSTypeAliasDeclaration"
      || parent.type === "TSInterfaceDeclaration"
      || parent.type === "TSLiteralType"
      || parent.type === "TSUnionType"
    ) {
      return true;
    }
    parent = getParent(parent);
  }

  return false;
}

export function isObjectKey(node: unknown): boolean {
  const parent = getParent(node);
  return parent?.type === "Property" && parent.key === node;
}

function isAstNode(node: unknown): node is AstNode {
  return typeof node === "object" && node !== null;
}

function getParent(node: unknown): AstNode | undefined {
  return isAstNode(node) ? node.parent : undefined;
}

function isTestCall(node: AstNode): boolean {
  return (
    node.type === "CallExpression"
    && (
      isTestIdentifier(node.callee)
      || isTestEachCall(node.callee)
      || isTestEachTemplateCall(node.callee)
    )
  );
}

function isTestIdentifier(callee: NamedCallee | undefined): boolean {
  return (
    callee?.type === "Identifier"
    && typeof callee.name === "string"
    && TEST_FUNCTION_NAMES.has(callee.name)
  );
}

function isTestEachCall(callee: NamedCallee | undefined): boolean {
  return (
    callee?.type === "MemberExpression"
    && isTestIdentifier(callee.object)
    && callee.property?.type === "Identifier"
    && callee.property.name === "each"
  );
}

function isTestEachTemplateCall(callee: NamedCallee | undefined): boolean {
  return callee?.type === "CallExpression" && isTestEachCall(callee.callee);
}
