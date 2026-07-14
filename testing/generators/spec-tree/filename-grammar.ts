import { SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

export type FilenameGrammarTokenCase = {
  readonly name: string;
  readonly size: number;
};

export const FILENAME_GRAMMAR_TOKEN_CASES = [
  { name: "product suffix", size: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX.length },
  { name: "evidence directory", size: SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME.length },
  { name: "evidence modes", size: SPEC_TREE_GRAMMAR.EVIDENCE.MODES.length },
  { name: "execution levels", size: SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS.length },
  { name: "language tails", size: Object.keys(SPEC_TREE_GRAMMAR.EVIDENCE.TAILS).length },
  { name: "evidence segment separator", size: SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR.length },
  { name: "runner tokens", size: SPEC_TREE_GRAMMAR.RUNNERS.length },
  { name: "order separator", size: SPEC_TREE_GRAMMAR.ORDER.SEPARATOR.length },
  { name: "order pattern", size: SPEC_TREE_GRAMMAR.ORDER.PATTERN.source.length },
  { name: "path separator", size: SPEC_TREE_GRAMMAR.PATH_SEPARATOR.length },
  { name: "coordination notes", size: SPEC_TREE_GRAMMAR.COORDINATION_NOTES.length },
  { name: "eval directory", size: SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME.length },
  { name: "eval files", size: SPEC_TREE_GRAMMAR.EVAL.FILES.length },
  { name: "eval runs directory", size: SPEC_TREE_GRAMMAR.EVAL.RUNS_DIRECTORY_NAME.length },
  { name: "canonical spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX.length },
  { name: "prior spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX.length },
  { name: "prior node suffixes", size: SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES.length },
] as const satisfies readonly FilenameGrammarTokenCase[];
