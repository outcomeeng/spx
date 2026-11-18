/**
 * Cases for the Audit File directory an output node may hold, with the verdict the filename-grammar
 * spec's `audit-directory` table states for each naming-schema version.
 *
 * Each path and verdict is the table read directly — the 4.0 version accepts `audits/<slug>.json`
 * for any slug, `audits/evidence/test.json` and `audits/evidence/eval.json`, and rejects
 * `audits/evidence/<slug>.json` for a slug not `test` or `eval`; the 3.x version accepts no `audits/`
 * directory — held as local statement literals apart from the registry the version composes from,
 * so a name missing from, or misspelled in, the registry surface leaves the expectation standing.
 *
 * @module generators/spec-tree/audit-directory
 */

import type { SpecTreeEvalEntryKind, SpecTreeMethodologyLine } from "@/lib/spec-tree";
import { SPEC_TREE_EVAL_ENTRY_KIND, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { arbitrarySlug } from "@testing/generators/spec-tree/lane-directories";
import { sampleSpecTreeTestValue } from "@testing/generators/spec-tree/spec-tree";

/** The names the `audit-directory` table states, as the spec writes them. */
const AUDIT_DIRECTORY_STATEMENT = {
  directory: "audits",
  evidenceDirectory: "evidence",
  extension: ".json",
  evidenceFiles: ["test.json", "eval.json"],
  evidenceStems: ["test", "eval"],
  pathSeparator: "/",
} as const;

/** One table row: its case slug and the verdict of each version. */
const AUDIT_DIRECTORY_ROW = {
  AUDIT_FILE: "audit-file",
  EVIDENCE_TEST: "evidence-test",
  EVIDENCE_EVAL: "evidence-eval",
  EVIDENCE_OTHER: "evidence-other",
} as const;

type AuditDirectoryRow = (typeof AUDIT_DIRECTORY_ROW)[keyof typeof AUDIT_DIRECTORY_ROW];

/** One entry path under a node and whether a methodology line's version accepts it as Audit File content. */
export type AuditDirectoryCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly pathFromNode: string;
  readonly entryKind: SpecTreeEvalEntryKind;
  readonly accepted: boolean;
};

const FOUR_ZERO_LINE = SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO;
const THREE_X_LINE = SPEC_TREE_METHODOLOGY_LINE.THREE_TWO;
const SLUG_DRAW_COUNT = 5;
const SLUG_DRAW_BASE = 1;

function joined(...segments: readonly string[]): string {
  return segments.join(AUDIT_DIRECTORY_STATEMENT.pathSeparator);
}

function auditCase(
  row: AuditDirectoryRow | undefined,
  line: SpecTreeMethodologyLine,
  pathFromNode: string,
  entryKind: SpecTreeEvalEntryKind,
  accepted: boolean,
): AuditDirectoryCase {
  const verdict = accepted ? "accepts" : "rejects";
  const label = row === undefined ? "" : `${row}: `;
  return {
    title: `${label}${line} ${verdict} the ${entryKind} ${pathFromNode}`,
    line,
    pathFromNode,
    entryKind,
    accepted,
  };
}

function sampledSlugs(excluded: readonly string[]): readonly string[] {
  const slugs = arbitrarySlug().filter((slug) => !excluded.includes(slug));
  return Array.from({ length: SLUG_DRAW_COUNT }, (_, draw) => sampleSpecTreeTestValue(slugs, SLUG_DRAW_BASE + draw));
}

function auditFileName(slug: string): string {
  return `${slug}${AUDIT_DIRECTORY_STATEMENT.extension}`;
}

/**
 * Each row of the `audit-directory` table, for the 4.0 and the 3.x version: an Audit File named by
 * a generated slug directly under `audits/`, the two `evidence` Audit Files, and an `evidence` file
 * named by a generated slug other than `test` and `eval`. The `audits` and `audits/evidence`
 * directories the 4.0 rows sit in are accepted by the 4.0 version, and the 3.x version accepts no
 * `audits/` directory.
 */
export function auditDirectoryCases(): readonly AuditDirectoryCase[] {
  const { directory, evidenceDirectory, evidenceFiles, evidenceStems } = AUDIT_DIRECTORY_STATEMENT;
  const [testFile, evalFile] = evidenceFiles;
  const file = SPEC_TREE_EVAL_ENTRY_KIND.FILE;
  const dir = SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY;
  const rows: readonly (readonly [AuditDirectoryRow, string, boolean])[] = [
    ...sampledSlugs([]).map((slug) =>
      [AUDIT_DIRECTORY_ROW.AUDIT_FILE, joined(directory, auditFileName(slug)), true] as const
    ),
    [AUDIT_DIRECTORY_ROW.EVIDENCE_TEST, joined(directory, evidenceDirectory, testFile), true],
    [AUDIT_DIRECTORY_ROW.EVIDENCE_EVAL, joined(directory, evidenceDirectory, evalFile), true],
    ...sampledSlugs(evidenceStems).map((slug) =>
      [AUDIT_DIRECTORY_ROW.EVIDENCE_OTHER, joined(directory, evidenceDirectory, auditFileName(slug)), false] as const
    ),
  ];
  return [
    auditCase(undefined, FOUR_ZERO_LINE, directory, dir, true),
    auditCase(undefined, FOUR_ZERO_LINE, joined(directory, evidenceDirectory), dir, true),
    auditCase(undefined, THREE_X_LINE, directory, dir, false),
    auditCase(undefined, THREE_X_LINE, joined(directory, evidenceDirectory), dir, false),
    ...rows.flatMap(([row, pathFromNode, fourZeroAccepts]) => [
      auditCase(row, FOUR_ZERO_LINE, pathFromNode, file, fourZeroAccepts),
      auditCase(row, THREE_X_LINE, pathFromNode, file, false),
    ]),
  ];
}
