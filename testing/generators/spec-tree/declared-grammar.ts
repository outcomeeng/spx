/**
 * The filename-grammar tokens the filename-grammar spec states by value, one declaration per spec
 * statement.
 *
 * Each declaration is the literal its spec assertion states, and no field the library resolves it
 * through, so changing a token in the grammar registry changes the library and leaves these
 * declarations standing. A token no spec assertion or decision states by value has no declaration
 * here and therefore no expected value in any token mapping.
 *
 * @module generators/spec-tree/declared-grammar
 */

import { DECLARED_KIND_FORMS, declaredKinds } from "@testing/generators/spec-tree/declared-kinds";

/**
 * The statement that both the 4.0 and the 3.x naming-schema version accept, under a node's `tests/`
 * directory, an evidence file `{subject}.{evidence}.{level}`, an optional runner token, then a
 * language tail, each segment separated by `.`.
 */
export const DECLARED_EVIDENCE_FILE_GRAMMAR = {
  evidence: {
    DIRECTORY_NAME: "tests",
    MODES: ["scenario", "mapping", "conformance", "property", "compliance"],
    LEVELS: ["l1", "l2", "l3"],
    TAILS: { TYPESCRIPT: ["test", "ts"], PYTHON: ["py"], RUST: ["rs"] },
    SEGMENT_SEPARATOR: ".",
  },
  runners: ["vitest", "playwright", "subprocess"],
} as const;

/**
 * The statement that both the 4.0 and the 3.x naming-schema version accept, under a node's
 * `evals/{rule-slug}/` directory, the files `eval.toml`, `cases.jsonl`, `prompt.md`,
 * `prompt.template.md`, and `history.jsonl`, and a `runs/` directory.
 */
export const DECLARED_EVAL_LANE = {
  DIRECTORY_NAME: "evals",
  FILES: ["eval.toml", "cases.jsonl", "prompt.md", "prompt.template.md", "history.jsonl"],
  RUNS_DIRECTORY_NAME: "runs",
} as const;

/** The statement that the first naming-schema version accepts `.capability`, `.feature`, and `.story` node directories. */
export const DECLARED_FIRST_VERSION_NODE_SUFFIXES = [".capability", ".feature", ".story"] as const;

/** The first-version node suffixes no registered kind carries: the suffixes only a prior version accepts. */
export function declaredPriorNodeSuffixes(): readonly string[] {
  const registered = new Set<string>(declaredKinds().map((kind) => DECLARED_KIND_FORMS[kind].suffix));
  return DECLARED_FIRST_VERSION_NODE_SUFFIXES.filter((suffix) => !registered.has(suffix));
}

/** The statement that a 3.x root names its product `{name}.product.md`. */
export const DECLARED_PRODUCT_ROOT_SUFFIX = ".product.md";

/** The statements that a 4.0 spec file is `{slug}.spec.md` and a 3.x spec file is `{slug}.md`. */
export const DECLARED_SPEC_FILE_SUFFIX = { CANONICAL: ".spec.md", PRIOR: ".md" } as const;

/** The statements that 3.x node-local notes are `PLAN.md` and `ISSUES.md`. */
export const DECLARED_COORDINATION_NOTES = ["PLAN.md", "ISSUES.md"] as const;

/** The statement of the decision forms `{index}-{slug}.adr.md` and `{index}-{slug}.pdr.md`: the index and slug are joined by `-`. */
export const DECLARED_ORDER_SEPARATOR = "-";
