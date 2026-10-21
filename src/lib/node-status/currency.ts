import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { changedPathsForWorktreeComparison } from "@/lib/git/changed-paths";
import { committedFileContent } from "@/lib/git/release";
import type { GitDependencies } from "@/lib/git/root";

import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  type NodeStatusClaimEntry,
  type NodeStatusClaimSection,
} from "./claim";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "./classify";
import { isLinkFormatOnlyEdit, isSpecPath } from "./link-format";

/** Whether a result's pin still holds against the checkout. */
export const NODE_STATUS_CURRENCY = {
  CURRENT: "current",
  NOT_CURRENT: "not-current",
  UNPINNED: "unpinned",
} as const;

export type NodeStatusCurrency = (typeof NODE_STATUS_CURRENCY)[keyof typeof NODE_STATUS_CURRENCY];

/** The sections whose results stay current across a link-format edit to a spec they read. */
const LINK_TOLERANT_SECTIONS: ReadonlySet<NodeStatusClaimSection> = new Set([
  NODE_STATUS_CLAIM_SECTION.AUDIT,
  NODE_STATUS_CLAIM_SECTION.EVIDENCE,
]);

/** What a pin comparison asks of git: the paths that differ from a commit, and whether a spec's change is link-format only. */
export interface PinChangeReader {
  /** Paths that differ between `commit` and the checkout, or `undefined` when the commit cannot be compared. */
  changedPaths(commit: string): Promise<ReadonlySet<string> | undefined>;
  linkFormatOnlyEdit(commit: string, specPath: string): Promise<boolean>;
}

export interface PinChangeReaderOptions {
  readonly productDir: string;
  readonly git: GitDependencies;
}

/** A pin-change reader over git that compares each distinct commit with the checkout once. */
export function createPinChangeReader(options: PinChangeReaderOptions): PinChangeReader {
  const changedByCommit = new Map<string, Promise<ReadonlySet<string> | undefined>>();
  return {
    changedPaths(commit) {
      const cached = changedByCommit.get(commit);
      if (cached !== undefined) return cached;
      const compared = changedPathsForWorktreeComparison({
        git: options.git,
        productDir: options.productDir,
        base: commit,
      }).then(
        (paths): ReadonlySet<string> | undefined => new Set(paths),
        (): ReadonlySet<string> | undefined => undefined,
      );
      changedByCommit.set(commit, compared);
      return compared;
    },
    async linkFormatOnlyEdit(commit, specPath) {
      const before = await committedFileContent(commit, specPath, options.productDir, options.git);
      if (before === null) return false;
      let after: string;
      try {
        after = await readFile(join(options.productDir, specPath), "utf8");
      } catch {
        return false;
      }
      return isLinkFormatOnlyEdit(before, after, specPath);
    },
  };
}

/**
 * Whether a result's pin holds: no path it read differs between its commit and the checkout. An audit or evidence
 * result also stays current when every changed pinned path is a spec changed only in link format.
 */
export async function resultCurrency(
  section: NodeStatusClaimSection,
  entry: NodeStatusClaimEntry,
  reader: PinChangeReader,
): Promise<NodeStatusCurrency> {
  const commit = entry[NODE_STATUS_CLAIM_FIELD.COMMIT];
  const read = entry[NODE_STATUS_CLAIM_FIELD.READ];
  if (entry[NODE_STATUS_CLAIM_FIELD.VERDICT] === NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN) {
    return NODE_STATUS_CURRENCY.UNPINNED;
  }
  if (commit === undefined || read === undefined) return NODE_STATUS_CURRENCY.NOT_CURRENT;
  const changed = await reader.changedPaths(commit);
  if (changed === undefined) return NODE_STATUS_CURRENCY.NOT_CURRENT;
  const changedRead = read.filter((path) => changed.has(path));
  if (changedRead.length === 0) return NODE_STATUS_CURRENCY.CURRENT;
  if (!LINK_TOLERANT_SECTIONS.has(section)) return NODE_STATUS_CURRENCY.NOT_CURRENT;
  for (const path of changedRead) {
    if (!isSpecPath(path) || !(await reader.linkFormatOnlyEdit(commit, path))) {
      return NODE_STATUS_CURRENCY.NOT_CURRENT;
    }
  }
  return NODE_STATUS_CURRENCY.CURRENT;
}
