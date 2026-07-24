import { relative } from "node:path";

import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";

export const NO_UNESCAPED_TERMINAL_TEXT_RULE_NAME = "no-unescaped-terminal-text";
export const NO_UNESCAPED_TERMINAL_TEXT_RULE_ID = `${SPX_RULE_PREFIX}${NO_UNESCAPED_TERMINAL_TEXT_RULE_NAME}` as const;
export const UNESCAPED_TERMINAL_TEXT_MESSAGE_ID = "unescapedTerminalText";

/** The module that owns composition; its own writes are the primitive, not a consumer of it. */
const TERMINAL_TEXT_MODULE_DIRECTORY = "src/lib/terminal-text/";
/** The call that unwraps composed text for a stream write. */
const RENDER_TERMINAL_TEXT_CALLEE = "renderTerminalText";
const PATH_SEPARATOR_PATTERN = /[/\\]+/gu;
const CONCATENATION_OPERATOR = "+";

/** Output-adapter methods that reach a terminal. */
const ADAPTER_WRITE_METHODS = new Set(["writeStdout", "writeStderr"]);
/** Process streams whose `write` reaches a terminal. */
const PROCESS_STREAMS = new Set(["stdout", "stderr"]);
/** Console methods that reach a terminal. */
const CONSOLE_OUTPUT_METHODS = new Set(["log", "error", "warn", "info", "debug", "trace"]);
const WRITE_METHOD = "write";
const PROCESS_IDENTIFIER = "process";
const CONSOLE_IDENTIFIER = "console";

type AstNode = {
  readonly type?: string;
  readonly name?: string;
  readonly operator?: string;
  readonly callee?: AstNode;
  readonly object?: AstNode;
  readonly property?: AstNode;
  readonly left?: AstNode;
  readonly right?: AstNode;
  readonly expressions?: readonly AstNode[];
  readonly arguments?: readonly AstNode[];
};

type RuleContextWithCwd = Rule.RuleContext & {
  readonly cwd?: string;
};

function identifierName(node: AstNode | undefined): string | undefined {
  return node?.type === "Identifier" ? node.name : undefined;
}

/**
 * A terminal sink is an output-adapter write (`io.writeStdout`, `deps.writeStderr`),
 * a process-stream write (`process.stdout.write`), or a console output method. The
 * adapter case matches on the method name alone because the adapter arrives through
 * dependency injection under many receiver names.
 */
function isTerminalSink(callee: AstNode | undefined): boolean {
  if (callee?.type !== "MemberExpression") return false;

  const method = identifierName(callee.property);
  if (method === undefined) return false;

  if (ADAPTER_WRITE_METHODS.has(method)) return true;

  if (method === WRITE_METHOD) {
    const stream = identifierName(callee.object?.property);
    return identifierName(callee.object?.object) === PROCESS_IDENTIFIER
      && stream !== undefined
      && PROCESS_STREAMS.has(stream);
  }

  return identifierName(callee.object) === CONSOLE_IDENTIFIER && CONSOLE_OUTPUT_METHODS.has(method);
}

/** Composed text unwrapped for the write carries its escaping decision already. */
function isComposedArgument(argument: AstNode): boolean {
  return argument.type === "CallExpression"
    && identifierName(argument.callee) === RENDER_TERMINAL_TEXT_CALLEE;
}

/**
 * An argument embeds a value when it interpolates into a template or concatenates a
 * non-literal operand. A bare identifier is not an embedding — the value it holds was
 * composed elsewhere, and this rule reports at the site where embedding happens.
 */
function embedsValue(argument: AstNode): boolean {
  if (argument.type === "TemplateLiteral") {
    return (argument.expressions?.length ?? 0) > 0;
  }

  if (argument.type === "BinaryExpression" && argument.operator === CONCATENATION_OPERATOR) {
    return [argument.left, argument.right].some((operand) => operand !== undefined && operand.type !== "Literal");
  }

  return false;
}

function normalizedModulePath(filename: string, cwd: string | undefined): string {
  const path = cwd === undefined ? filename : relative(cwd, filename);
  return path.replace(PATH_SEPARATOR_PATTERN, "/");
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require terminal-destined text to be composed through the terminal-text primitive rather than embedded at the write site",
    },
    messages: {
      [UNESCAPED_TERMINAL_TEXT_MESSAGE_ID]:
        "Do not embed a value into terminal-destined text at the write site. Compose it with the terminal-text primitive — authoredText for product-owned text, an interpolation for external values — and write renderTerminalText(...) instead.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const filename = context.filename ?? context.getFilename();
    const cwd = (context as RuleContextWithCwd).cwd;
    if (normalizedModulePath(filename, cwd).startsWith(TERMINAL_TEXT_MODULE_DIRECTORY)) {
      return {};
    }

    return {
      CallExpression(node: unknown) {
        if (typeof node !== "object" || node === null) return;
        const call = node as AstNode;
        if (!isTerminalSink(call.callee)) return;

        for (const argument of call.arguments ?? []) {
          if (isComposedArgument(argument)) continue;
          if (!embedsValue(argument)) continue;

          context.report({
            node: argument as never,
            messageId: UNESCAPED_TERMINAL_TEXT_MESSAGE_ID,
          });
        }
      },
    };
  },
};

export default rule;
