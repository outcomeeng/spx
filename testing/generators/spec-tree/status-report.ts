import * as fc from "fast-check";

import {
  NODE_STATUS_ACTOR_KIND,
  NODE_STATUS_CLAIM_FIELD,
  type NodeStatusActor,
  type NodeStatusEvidenceOutcome,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE, type SpecTreeNodeState } from "@/lib/spec-tree";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";

const ACTOR_ID_PATTERN = /^[a-z][a-z0-9-]{2,15}$/;
const RUN_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9a-f]{8}$/;

/**
 * What a recorded 4.0 claim holds beyond its pins: the state it records, the verdict of a Test result and of an
 * attributed Audit result, and the actor and run the attributed result carries.
 */
export type RecordedClaimFacts = {
  readonly state: SpecTreeNodeState;
  readonly testVerdict: NodeStatusEvidenceOutcome;
  readonly auditVerdict: NodeStatusEvidenceOutcome;
  readonly actor: NodeStatusActor;
  readonly run: string;
};

function arbitraryRecordedClaimFacts(): fc.Arbitrary<RecordedClaimFacts> {
  return fc.record({
    state: fc.constantFrom(...Object.values(SPEC_TREE_NODE_STATE)),
    testVerdict: NODE_STATUS_TEST_GENERATOR.recordedVerdict(),
    auditVerdict: NODE_STATUS_TEST_GENERATOR.recordedVerdict(),
    actor: fc.record({
      [NODE_STATUS_CLAIM_FIELD.ACTOR_KIND]: fc.constantFrom(...Object.values(NODE_STATUS_ACTOR_KIND)),
      [NODE_STATUS_CLAIM_FIELD.ACTOR_ID]: fc.stringMatching(ACTOR_ID_PATTERN),
    }),
    run: fc.stringMatching(RUN_PATTERN),
  });
}

export const STATUS_REPORT_TEST_GENERATOR = {
  recordedClaimFacts: arbitraryRecordedClaimFacts,
} as const;
