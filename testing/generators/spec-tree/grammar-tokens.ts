/**
 * Cases and spec-stated expectations for the token groups each naming-schema version carries: the
 * kind, product, and decision suffixes, the evidence, runner, separator, and order tokens, the
 * node-local coordination notes, and the eval-lane names.
 *
 * Each expectation is the filename-grammar spec's statement of what a methodology line's version
 * accepts, held apart from the registry the version composes from, so a group missing from the
 * registry surface or resolving to a different set leaves the expectation standing.
 *
 * @module generators/spec-tree/grammar-tokens
 */

import type { Arbitrary } from "fast-check";

import type { NamingSchemaVersion, SpecTreeMethodologyLine } from "@/lib/spec-tree";
import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { FOUR_ZERO_INDEX_GENERATOR, THREE_X_INDEX_GENERATOR } from "@testing/generators/spec-tree/naming-schema-form";
import { sampleSpecTreeTestValue, SPEC_TREE_SOURCE_LINES } from "@testing/generators/spec-tree/spec-tree";

/** One token group of a methodology line's naming-schema version: the tokens the spec states and how the version exposes them. */
export type GrammarTokenGroupCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly expected: readonly string[];
  readonly resolve: (version: NamingSchemaVersion) => readonly string[];
};

/** The node-local notes a methodology line's version accepts and the ones it does not. */
export type NodeLocalNoteCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
};

/** The eval-lane names a methodology line's version accepts under a node's eval directory. */
export type EvalLaneCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly directory: string;
  readonly files: readonly string[];
  readonly runsDirectory: string;
};

type LineStatement = {
  readonly nodeSuffixes: readonly string[];
  readonly productSuffix: string;
  readonly specFileSuffix: string;
  readonly notes: readonly string[];
  readonly rejectedNotes: readonly string[];
  readonly acceptedIndices: () => readonly string[];
};

const INDEX_DRAW_COUNT = 5;

function sampledIndices(accepted: () => Arbitrary<string>): readonly string[] {
  return Array.from({ length: INDEX_DRAW_COUNT }, (_, drawIndex) => sampleSpecTreeTestValue(accepted(), drawIndex));
}

const LINE_STATEMENT: Readonly<Partial<Record<SpecTreeMethodologyLine, LineStatement>>> = {
  [SPEC_TREE_METHODOLOGY_LINE.THREE_TWO]: {
    nodeSuffixes: [".enabler", ".outcome"],
    productSuffix: ".product.md",
    specFileSuffix: ".md",
    notes: ["PLAN.md", "ISSUES.md"],
    rejectedNotes: [],
    acceptedIndices: () => sampledIndices(THREE_X_INDEX_GENERATOR.accepted),
  },
  [SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO]: {
    nodeSuffixes: [".product", ".substrate", ".capability", ".domain", ".interface", ".surface", ".variant"],
    productSuffix: ".spec.md",
    specFileSuffix: ".spec.md",
    notes: ["ISSUES.md"],
    rejectedNotes: ["PLAN.md"],
    acceptedIndices: () => sampledIndices(FOUR_ZERO_INDEX_GENERATOR.accepted),
  },
};

const DECISION_SUFFIX_STATEMENT = [".adr.md", ".pdr.md"] as const;
const EVIDENCE_MODE_STATEMENT = ["scenario", "mapping", "conformance", "property", "compliance"] as const;
const EXECUTION_LEVEL_STATEMENT = ["l1", "l2", "l3"] as const;
const LANGUAGE_TAIL_STATEMENT = ["test", "ts", "py", "rs"] as const;
const RUNNER_STATEMENT = ["vitest", "playwright", "subprocess"] as const;
const SEGMENT_SEPARATOR_STATEMENT = "." as const;
const ORDER_SEPARATOR_STATEMENT = "-" as const;
const PATH_SEPARATOR_STATEMENT = "/" as const;
const EVAL_DIRECTORY_STATEMENT = "evals" as const;
const EVAL_FILE_STATEMENT = ["eval.toml", "cases.jsonl", "prompt.md", "prompt.template.md", "history.jsonl"] as const;
const EVAL_RUNS_STATEMENT = "runs" as const;

function statementForLine(line: SpecTreeMethodologyLine): LineStatement {
  const statement = LINE_STATEMENT[line];
  if (statement === undefined) throw new Error(`No filename-grammar statement is made for methodology line ${line}`);
  return statement;
}

/**
 * Per methodology line, one case for each token group the spec enumerates: kind and product
 * suffixes, evidence modes, execution levels, language tails, the runner token, segment and order
 * separators, the order pattern, coordination-note names, eval-lane names, and spec-file suffixes.
 */
export function grammarTokenGroupCases(): readonly GrammarTokenGroupCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line): readonly GrammarTokenGroupCase[] => {
    const statement = statementForLine(line);
    const group = (
      name: string,
      expected: readonly string[],
      resolve: (version: NamingSchemaVersion) => readonly string[],
    ): GrammarTokenGroupCase => ({ title: `${line} ${name}`, line, expected, resolve });
    return [
      group("kind suffixes", statement.nodeSuffixes, (version) => version.nodeSuffixes),
      group("decision suffixes", DECISION_SUFFIX_STATEMENT, (version) => version.decisionSuffixes),
      group("product suffix", [statement.productSuffix], (version) => [version.productSuffix]),
      group("evidence modes", EVIDENCE_MODE_STATEMENT, (version) => version.evidence.MODES),
      group("execution levels", EXECUTION_LEVEL_STATEMENT, (version) => version.evidence.LEVELS),
      group(
        "language tails",
        LANGUAGE_TAIL_STATEMENT,
        (version) => Object.values(version.evidence.TAILS).flat(),
      ),
      group("runner tokens", RUNNER_STATEMENT, (version) => version.runners),
      group(
        "segment separator",
        [SEGMENT_SEPARATOR_STATEMENT],
        (version) => [version.evidence.SEGMENT_SEPARATOR],
      ),
      group("order separator", [ORDER_SEPARATOR_STATEMENT], (version) => [version.order.SEPARATOR]),
      group("path separator", [PATH_SEPARATOR_STATEMENT], (version) => [version.pathSeparator]),
      group(
        "order pattern",
        statement.acceptedIndices(),
        (version) => statement.acceptedIndices().filter((index) => version.order.PATTERN.test(index)),
      ),
      group("coordination-note names", statement.notes, (version) => version.coordinationNotes),
      group(
        "eval-lane names",
        [EVAL_DIRECTORY_STATEMENT, ...EVAL_FILE_STATEMENT, EVAL_RUNS_STATEMENT],
        (version) => [version.eval.DIRECTORY_NAME, ...version.eval.FILES, version.eval.RUNS_DIRECTORY_NAME],
      ),
      group("spec-file suffix", [statement.specFileSuffix], (version) => [version.specFileSuffix]),
    ];
  });
}

/** Per methodology line, the node-local notes its version accepts and the notes it does not. */
export function nodeLocalNoteCases(): readonly NodeLocalNoteCase[] {
  return SPEC_TREE_SOURCE_LINES.map((line) => {
    const statement = statementForLine(line);
    return {
      title: `${line} accepts ${statement.notes.join(" and ")}`,
      line,
      accepted: statement.notes,
      rejected: statement.rejectedNotes,
    };
  });
}

/** Per methodology line, the eval-lane files and runs directory its version accepts under `evals/{rule-slug}/`. */
export function evalLaneCases(): readonly EvalLaneCase[] {
  return SPEC_TREE_SOURCE_LINES.map((line) => ({
    title: `${line} accepts the eval-lane files and the runs directory`,
    line,
    directory: EVAL_DIRECTORY_STATEMENT,
    files: EVAL_FILE_STATEMENT,
    runsDirectory: EVAL_RUNS_STATEMENT,
  }));
}
