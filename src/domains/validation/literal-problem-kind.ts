export const LITERAL_PROBLEM_KIND = {
  REUSE: "reuse",
  DUPE: "dupe",
} as const;

export type LiteralProblemKind = (typeof LITERAL_PROBLEM_KIND)[keyof typeof LITERAL_PROBLEM_KIND];
