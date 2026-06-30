import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";

export const NO_TASK_MARKER_COMMENTS_RULE_NAME = "no-task-marker-comments";
export const NO_TASK_MARKER_COMMENTS_RULE_ID = `${SPX_RULE_PREFIX}${NO_TASK_MARKER_COMMENTS_RULE_NAME}` as const;
export const TASK_MARKER_COMMENT_MESSAGE_ID = "taskMarkerComment";
export const TASK_MARKER_COMMENT_TERMS = ["TODO", "FIXME"] as const;
export const TASK_MARKER_COMMENT_FALLBACK_FILES = [
  "eslint-rules/**/*.ts",
  "*.config.ts",
  "eslint.config.*.ts",
] as const;

const WORD_CHARACTER_PATTERN = "[A-Za-z0-9_]";
const TASK_MARKER_COMMENT_PATTERNS = TASK_MARKER_COMMENT_TERMS.map(
  (term) => new RegExp(`(?<!${WORD_CHARACTER_PATTERN})${term}(?!${WORD_CHARACTER_PATTERN})`, "u"),
);

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow uppercase task-marker comments",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      [TASK_MARKER_COMMENT_MESSAGE_ID]: "Resolve or remove uppercase task-marker comment '{{term}}'.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const sourceCode = context.sourceCode;

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const matchedTerm = TASK_MARKER_COMMENT_TERMS.find((_, index) =>
            TASK_MARKER_COMMENT_PATTERNS[index].test(comment.value)
          );
          if (matchedTerm === undefined) continue;

          context.report({
            node: comment as unknown as Rule.Node,
            messageId: TASK_MARKER_COMMENT_MESSAGE_ID,
            data: { term: matchedTerm },
          });
        }
      },
    };
  },
};

export default rule;
