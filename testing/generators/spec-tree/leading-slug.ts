/**
 * Cases of the leading-slug reader: each case is the text of one node spec or decision record
 * and the line whose leading slug the case judges, with the slug the methodology's slug grammar
 * gives that line, or none.
 *
 * @module generators/spec-tree/leading-slug
 */

const LINE_BREAK = "\n";
const FENCE = "```";
const STEP_INDENT = "  ";

/** One leading-slug case: the file's lines, the 1-based line it judges, and that line's leading slug. */
export type LeadingSlugCase = {
  readonly label: string;
  readonly lines: readonly string[];
  readonly line: number;
  readonly slug: string | undefined;
};

function single(label: string, line: string, slug: string | undefined): LeadingSlugCase {
  return { label, lines: [line], line: 1, slug };
}

/** The cases of the `leading-slug` Mapping, one per row of its table. */
export const LEADING_SLUG_CASES: readonly LeadingSlugCase[] = [
  single("plain-row", "- line-verbatim: NEVER: a task drops a character.", "line-verbatim"),
  single(
    "linked-row",
    "- [line-verbatim](tests/capture.compliance.l1.test.ts): NEVER: a task drops a character.",
    "line-verbatim",
  ),
  {
    label: "scenario-row",
    lines: ["- capture-basic:", `${STEP_INDENT}- Given the line "buy milk"`, `${STEP_INDENT}- When it is captured`],
    line: 1,
    slug: "capture-basic",
  },
  single("digit-in-word", "- retry-in5s: ALWAYS: a failed capture retries.", "retry-in5s"),
  single("digit-led-word", "- retry-in-5s: ALWAYS: a failed capture retries.", undefined),
  single("reserved-word", "- title: ALWAYS: a task keeps its title.", "title"),
  single("mapping-heading", "### Test.Mapping: priority-order", "priority-order"),
  single(
    "linked-mapping-heading",
    "### Test.Mapping: [priority-order](tests/priority.mapping.l1.test.ts)",
    "priority-order",
  ),
  single("evaluate-heading", "### Evaluate: capture-title", "capture-title"),
  single("keyword-row", "- ALWAYS: a submitted line yields a task.", undefined),
  single("prose-row", "- Given a node, when it is read, then it reports its state", undefined),
  {
    label: "step-line",
    lines: ["- capture-basic:", `${STEP_INDENT}- Given the line "buy milk"`],
    line: 2,
    slug: undefined,
  },
  single("group-heading", "### Test.Compliance: capture", undefined),
  single("no-space", "- line-verbatim:NEVER: a task drops a character.", undefined),
  single("digit-first-word", "- capture-2fa: ALWAYS: a code is asked once.", undefined),
  single("uppercase", "- Line-verbatim: NEVER: a task drops a character.", undefined),
  single("double-hyphen", "- line--verbatim: NEVER: a task drops a character.", undefined),
  {
    label: "fenced-row",
    lines: [FENCE, "- line-verbatim: NEVER: a task drops a character.", FENCE],
    line: 2,
    slug: undefined,
  },
];

/** The text of a case's file. */
export function leadingSlugCaseText(leadingSlugCase: LeadingSlugCase): string {
  return leadingSlugCase.lines.join(LINE_BREAK);
}
