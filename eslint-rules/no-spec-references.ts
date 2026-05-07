/**
 * ESLint Rule: No Spec References
 *
 * Detects ADR-NN / PDR-NN references in string literals, template literals,
 * and comments. Code must not reference spx/ artifacts. The spec is the
 * source of truth; tests make the spec's assertions executable; code complies.
 */

import type { Rule } from "eslint";

import { SPX_RULE_PREFIX } from "./import-source";

export const NO_SPEC_REFERENCES_RULE_NAME = "no-spec-references";
export const NO_SPEC_REFERENCES_RULE_ID = `${SPX_RULE_PREFIX}${NO_SPEC_REFERENCES_RULE_NAME}` as const;
export const SPEC_REFERENCE_MESSAGE_ID = "specReference";

/**
 * Matches spec-tree decision references in code:
 * - Numbered: ADR-15, PDR-15, ADR 32 (hyphen, en-dash, em-dash, or space separator)
 * - Path-based: "ADR: spx/..." or "PDR: spx/..."
 */
const SPEC_REFERENCE = /\b[AP]DR(?:[-–— ]\d+|:\s)/;

/** Files where spec references are legitimate test data — exempt from the rule. */
const EXEMPT_SUFFIXES = [
  "eslint-rules/no-spec-references.ts",
  // The validation generator owns ADR/PDR snippets used as violating rule inputs.
  "testing/generators/validation/ast-enforcement.ts",
  "32-ast-enforcement.enabler/tests/ast-enforcement.mapping.l1.test.ts",
];

function isExemptFile(filename: string): boolean {
  return EXEMPT_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow references to spx/ artifacts (ADRs, PDRs, specs) in code — the spec is the source of truth, tests make assertions executable, code complies",
    },
    messages: {
      [SPEC_REFERENCE_MESSAGE_ID]:
        "Spec reference '{{value}}' detected. Code must not reference spx/ artifacts such as ADRs or PDRs. The spec is the source of truth; tests make the spec's assertions executable; code complies.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isExemptFile(filename)) return {};

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        const match = node.value.match(SPEC_REFERENCE);
        if (match) {
          context.report({
            node,
            messageId: SPEC_REFERENCE_MESSAGE_ID,
            data: { value: match[0] },
          });
        }
      },

      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const match = quasi.value.raw.match(SPEC_REFERENCE);
          if (match) {
            context.report({
              node,
              messageId: SPEC_REFERENCE_MESSAGE_ID,
              data: { value: match[0] },
            });
            break;
          }
        }
      },

      Program() {
        const comments = context.sourceCode.getAllComments();
        for (const comment of comments) {
          const match = comment.value.match(SPEC_REFERENCE);
          if (match) {
            context.report({
              loc: comment.loc!,
              messageId: SPEC_REFERENCE_MESSAGE_ID,
              data: { value: match[0] },
            });
          }
        }
      },
    };
  },
};

export default rule;
