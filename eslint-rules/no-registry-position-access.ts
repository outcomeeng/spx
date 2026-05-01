import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";

export const NO_REGISTRY_POSITION_ACCESS_RULE_NAME = "no-registry-position-access";
export const NO_REGISTRY_POSITION_ACCESS_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_REGISTRY_POSITION_ACCESS_RULE_NAME}` as const;
export const REGISTRY_POSITION_ACCESS_MESSAGE_ID = "registryPositionAccess";

const GENERATOR_PATH_SEGMENT = "testing/generators/";
const POSITIONAL_REGISTRY_NAMES: ReadonlySet<string> = new Set(["NODE_KINDS", "DECISION_KINDS"]);

type AstNode = {
  readonly type?: string;
  readonly computed?: boolean;
  readonly object?: AstNode;
  readonly property?: AstNode;
  readonly name?: string;
  readonly value?: unknown;
};

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow positional reads from source-owned registries in runtime tests",
    },
    messages: {
      [REGISTRY_POSITION_ACCESS_MESSAGE_ID]:
        "Do not read source-owned registry '{{name}}' by numeric position. Use a named member or a generator helper.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const filename = context.filename ?? context.getFilename();
    if (filename.includes(GENERATOR_PATH_SEGMENT)) {
      return {};
    }

    return {
      MemberExpression(node: AstNode) {
        if (node.computed !== true) return;
        if (!isNumericIndex(node.property)) return;

        const name = registryNameOf(node.object);
        if (name === undefined) return;
        if (!POSITIONAL_REGISTRY_NAMES.has(name)) return;

        context.report({
          node: node as never,
          messageId: REGISTRY_POSITION_ACCESS_MESSAGE_ID,
          data: { name },
        });
      },
    };
  },
};

function isNumericIndex(node: AstNode | undefined): boolean {
  return node?.type === "Literal" && typeof node.value === "number";
}

function registryNameOf(node: AstNode | undefined): string | undefined {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression" && node.property?.type === "Identifier") {
    return node.property.name;
  }
  return undefined;
}

export default rule;
