import { SPEC_TREE_NODE_STATE, type SpecTreeNodeState } from "@/lib/spec-tree/config";

/**
 * The three observable facts that determine a spec-tree node's lifecycle state.
 *
 * - `hasTests` — the node directory contains co-located evidence files.
 * - `isExcluded` — the node path is listed in `spx/EXCLUDE`.
 * - `testsPass` — the node's tests all pass when executed.
 */
export interface NodeClassificationFacts {
  readonly hasTests: boolean;
  readonly isExcluded: boolean;
  readonly testsPass: boolean;
}

/** JSON key under which the lifecycle state is recorded in `spx.status.json`. */
export const NODE_STATUS_STATUS_KEY = "status";

const NODE_STATUS_JSON_INDENT = 2;

/**
 * Resolve a node's lifecycle state from its classification facts.
 *
 * Precedence (declared in `node-status.md`): a node with no co-located tests is
 * `declared`; otherwise a node listed in `spx/EXCLUDE` is `specified`; otherwise
 * a node whose tests pass is `passing`; otherwise the node is `failing`.
 */
export function classifyNodeStatus(facts: NodeClassificationFacts): SpecTreeNodeState {
  if (!facts.hasTests) return SPEC_TREE_NODE_STATE.DECLARED;
  if (facts.isExcluded) return SPEC_TREE_NODE_STATE.SPECIFIED;
  if (facts.testsPass) return SPEC_TREE_NODE_STATE.PASSING;
  return SPEC_TREE_NODE_STATE.FAILING;
}

/** Serialize a lifecycle state to the canonical `spx.status.json` document. */
export function serializeNodeStatus(state: SpecTreeNodeState): string {
  return `${JSON.stringify({ [NODE_STATUS_STATUS_KEY]: state }, null, NODE_STATUS_JSON_INDENT)}\n`;
}
