import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";

export const NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME = "no-async-spawn-outside-lifecycle";
export const NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_ID =
  `${SPX_RULE_PREFIX}${NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME}` as const;
export const ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID = "asyncSpawnOutsideLifecycle";

const LIFECYCLE_HOME_PATH_SEGMENT = "src/lib/process-lifecycle/";
const TEST_INFRASTRUCTURE_PATH_SEGMENT = "testing/";
const CHILD_PROCESS_MODULE_NAMES: ReadonlySet<string> = new Set([
  "child_process",
  "node:child_process",
]);
const SPAWN_IMPORT_NAME = "spawn";

type AstNode = {
  readonly type?: string;
  readonly source?: { readonly value?: unknown };
  readonly specifiers?: ReadonlyArray<{
    readonly type?: string;
    readonly imported?: { readonly type?: string; readonly name?: string };
  }>;
};

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid asynchronous child_process.spawn imports outside src/lib/process-lifecycle/",
    },
    messages: {
      [ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID]:
        "Asynchronous child_process.spawn must be imported only by src/lib/process-lifecycle/. Use lifecycleProcessRunner from @/lib/process-lifecycle, or relocate this code into the lifecycle module.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const filename = context.filename ?? context.getFilename();
    if (
      filename.includes(LIFECYCLE_HOME_PATH_SEGMENT)
      || filename.includes(TEST_INFRASTRUCTURE_PATH_SEGMENT)
    ) {
      return {};
    }

    return {
      ImportDeclaration(node: unknown) {
        if (!isAstNode(node)) return;
        const moduleName = node.source?.value;
        if (typeof moduleName !== "string") return;
        if (!CHILD_PROCESS_MODULE_NAMES.has(moduleName)) return;

        const specifiers = node.specifiers ?? [];
        for (const specifier of specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          if (specifier.imported?.type !== "Identifier") continue;
          if (specifier.imported.name !== SPAWN_IMPORT_NAME) continue;

          context.report({
            node: node as never,
            messageId: ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID,
          });
          return;
        }
      },
    };
  },
};

function isAstNode(node: unknown): node is AstNode {
  return typeof node === "object" && node !== null;
}

export default rule;
