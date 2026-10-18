import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR, type SpecTreeNodeState } from "@/lib/spec-tree";

import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SHAPE,
  type NodeStatusActor,
  type NodeStatusClaimEntry,
  nodeStatusClaimResults,
  type NodeStatusClaimShape,
} from "./claim";
import { NODE_STATUS_FIELD, type NodeStatusEvidenceOutcome } from "./classify";
import { createPinChangeReader, NODE_STATUS_CURRENCY, type NodeStatusCurrency, resultCurrency } from "./currency";
import { parseNodeStatusFile } from "./read";
import { collectNodeStatusFiles } from "./status-files";

const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;

/** The fields of a result that its claim entry supplies. */
export type NodeStatusEntryFields = {
  readonly [NODE_STATUS_CLAIM_FIELD.VERDICT]: NodeStatusEvidenceOutcome;
  readonly [NODE_STATUS_CLAIM_FIELD.COMMIT]?: string;
  readonly [NODE_STATUS_CLAIM_FIELD.READ]?: readonly string[];
  readonly [NODE_STATUS_CLAIM_FIELD.ACTOR]?: NodeStatusActor;
  readonly [NODE_STATUS_CLAIM_FIELD.RUN]?: string;
};

/** One recorded result as `spx spec status` reports it: its verdict, pin, actor, run, and whether the pin is current. */
export interface NodeStatusResultReport extends NodeStatusEntryFields {
  readonly section: string;
  readonly key: string;
  readonly currency: NodeStatusCurrency;
}

/** A node's committed claim as `spx spec status` reports it: the shape it was written in, its state, and its results. */
export interface NodeStatusClaimReport {
  readonly shape: NodeStatusClaimShape;
  readonly [NODE_STATUS_CLAIM_FIELD.STATE]?: SpecTreeNodeState;
  readonly [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]?: string;
  readonly results: readonly NodeStatusResultReport[];
}

export interface ReadNodeStatusReportsOptions {
  readonly gitDependencies?: GitDependencies;
}

/**
 * Read every committed claim under the product's tree into a report keyed by node id. Reads files and compares pins
 * with the checkout through git; executes no verification and writes nothing.
 */
export async function readNodeStatusReports(
  productDir: string,
  options: ReadNodeStatusReportsOptions = {},
): Promise<ReadonlyMap<string, NodeStatusClaimReport>> {
  const { gitDependencies = defaultGitDependencies } = options;
  const pinChanges = createPinChangeReader({ productDir, git: gitDependencies });
  const treeRoot = join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
  const reports = new Map<string, NodeStatusClaimReport>();

  for (const statusPath of await collectNodeStatusFiles(treeRoot)) {
    const nodeId = relative(treeRoot, dirname(statusPath)).split(/[\\/]/).join(PATH_SEPARATOR);
    const read = parseNodeStatusFile(JSON.parse(readFileSync(statusPath, "utf8")), statusPath);
    if (read.shape === NODE_STATUS_CLAIM_SHAPE.VERSION_1) {
      const results: NodeStatusResultReport[] = [];
      for (const [section, record] of Object.entries(read.claim.verification)) {
        for (const [key, verdict] of Object.entries(record)) {
          if (key === NODE_STATUS_FIELD.OVERALL) continue;
          results.push({
            section,
            key,
            [NODE_STATUS_CLAIM_FIELD.VERDICT]: verdict as NodeStatusEvidenceOutcome,
            currency: NODE_STATUS_CURRENCY.UNPINNED,
          });
        }
      }
      reports.set(nodeId, { shape: NODE_STATUS_CLAIM_SHAPE.VERSION_1, results });
      continue;
    }
    const results = await Promise.all(
      nodeStatusClaimResults(read.claim).map(async ({ section, key, entry }) => ({
        section,
        key,
        ...entryFields(entry),
        currency: await resultCurrency(section, entry, pinChanges),
      })),
    );
    reports.set(nodeId, {
      shape: NODE_STATUS_CLAIM_SHAPE.CURRENT,
      [NODE_STATUS_CLAIM_FIELD.STATE]: read.claim[NODE_STATUS_CLAIM_FIELD.STATE],
      [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: read.claim[NODE_STATUS_CLAIM_FIELD.MALLEABILITY],
      results,
    });
  }
  return reports;
}

function entryFields(entry: NodeStatusClaimEntry): NodeStatusEntryFields {
  return {
    [NODE_STATUS_CLAIM_FIELD.VERDICT]: entry[NODE_STATUS_CLAIM_FIELD.VERDICT],
    ...(entry[NODE_STATUS_CLAIM_FIELD.COMMIT] === undefined
      ? {}
      : { [NODE_STATUS_CLAIM_FIELD.COMMIT]: entry[NODE_STATUS_CLAIM_FIELD.COMMIT] }),
    ...(entry[NODE_STATUS_CLAIM_FIELD.READ] === undefined
      ? {}
      : { [NODE_STATUS_CLAIM_FIELD.READ]: entry[NODE_STATUS_CLAIM_FIELD.READ] }),
    ...(entry[NODE_STATUS_CLAIM_FIELD.ACTOR] === undefined
      ? {}
      : { [NODE_STATUS_CLAIM_FIELD.ACTOR]: entry[NODE_STATUS_CLAIM_FIELD.ACTOR] }),
    ...(entry[NODE_STATUS_CLAIM_FIELD.RUN] === undefined
      ? {}
      : { [NODE_STATUS_CLAIM_FIELD.RUN]: entry[NODE_STATUS_CLAIM_FIELD.RUN] }),
  };
}
