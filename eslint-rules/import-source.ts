import type { Rule } from "eslint";

export const SPX_RULE_PREFIX = "spx/";

export type AstNode = {
  readonly type: string;
  readonly source?: unknown;
  readonly moduleSpecifier?: unknown;
  readonly value?: unknown;
  readonly raw?: unknown;
};

export type ModuleSource =
  | {
    readonly node: AstNode;
    readonly value: string;
  }
  | null;

const INTERNAL_ALIAS_PREFIXES = [
  "@/",
  "@root/",
  "@scripts/",
  "@testing/",
  "@eslint-rules/",
] as const;

export function isInternalModuleSource(value: string): boolean {
  return value.startsWith(".") || INTERNAL_ALIAS_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function getLiteralSource(node: unknown): ModuleSource {
  if (!node || typeof node !== "object") return null;
  const typed = node as AstNode;
  if (typeof typed.value === "string") {
    return { node: typed, value: typed.value };
  }
  return null;
}

export function getModuleSource(node: AstNode): ModuleSource {
  if (
    node.type === "ImportDeclaration"
    || node.type === "ExportNamedDeclaration"
    || node.type === "ExportAllDeclaration"
  ) {
    return getLiteralSource(node.source);
  }

  if (node.type === "ImportExpression") {
    return getLiteralSource(node.source);
  }

  if (node.type === "TSImportType") {
    return getLiteralSource(node.source);
  }

  return null;
}

export function getSourceTextQuote(sourceCode: Rule.RuleContext["sourceCode"], node: AstNode): string {
  const text = sourceCode.getText(node as never);
  const first = text.at(0);
  return first === "'" || first === "\"" || first === "`" ? first : "\"";
}
